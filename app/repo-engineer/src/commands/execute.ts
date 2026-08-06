/**
 * Phase D: execute — generate patch, approve, apply, verify, evidence
 *
 * Approval gates (all fail-closed by default):
 *   patch generation : always runs (read-only)
 *   --apply          : required flag to apply the diff to disk
 *   --verify         : required flag to run verification command
 *   --commit         : required flag to commit (implies --apply)
 *
 * Evidence is persisted regardless of outcome.
 * Patch artifact written to <patches-dir>/<patchId>.json
 */

import { resolve, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { writeFile } from 'node:fs/promises'
import { RohinikClient } from '../client/rohinik-client.js'
import { RohinikError } from '../client/types.js'
import { createRohinikClient, RohinikClientError } from '@rohinik-org/client'
import { collectFiles } from '../pipeline/file-collector.js'
import { buildPatchPrompt } from '../pipeline/patch-builder.js'
import {
  hashDiff, newPatchId, writePatch, readPatch, updatePatchStatus,
  writePatchApproval, writePatchApplication, writePatchVerification,
  readPatchApproval,
} from '../pipeline/patch-store.js'
import { readPlan } from '../pipeline/plan-store.js'
import { resolveEndpoint, resolveTimeoutMs } from '../config.js'

const execFileAsync = promisify(execFile)

const COORD_INSTANCE = 'inst-coordinator-1'
const WORKER_INSTANCE = 'inst-worker-1'

interface ExecuteArgs {
  planId:        string | undefined
  patchId:       string | undefined   // resume: skip generation, go to apply
  approveHash:   string | undefined   // required to apply
  plansDir:      string
  patchesDir:    string
  endpoint:      string
  maxFiles:      number
  apply:         boolean              // flag: apply diff to disk
  verify:        boolean              // flag: run verification command
  verifyCmd:     string               // default: 'pnpm test'
  commit:        boolean              // flag: git commit after verified apply
  dryRun:        boolean              // generate only, no server call
}

function parseArgs(argv: string[]): ExecuteArgs {
  const args = argv.slice(2)
  let planId: string | undefined
  let patchId: string | undefined
  let approveHash: string | undefined
  let endpoint = resolveEndpoint()
  let maxFiles = 20
  let plansDir = resolve('plans')
  let patchesDir = resolve('patches')
  let apply = false
  let verify = false
  let verifyCmd = 'pnpm test'
  let commit = false
  let dryRun = false

  for (let i = 0; i < args.length; i++) {
    const a = args[i]!
    if (a === '--plan'         && args[i + 1]) { planId      = args[++i]!; continue }
    if (a === '--patch'        && args[i + 1]) { patchId     = args[++i]!; continue }
    if (a === '--approve-hash' && args[i + 1]) { approveHash = args[++i]!; continue }
    if (a === '--endpoint'     && args[i + 1]) { endpoint    = args[++i]!; continue }
    if (a === '--max-files'    && args[i + 1]) { maxFiles    = parseInt(args[++i]!, 10); continue }
    if (a === '--plans-dir'    && args[i + 1]) { plansDir    = resolve(args[++i]!); continue }
    if (a === '--patches-dir'  && args[i + 1]) { patchesDir  = resolve(args[++i]!); continue }
    if (a === '--verify-cmd'   && args[i + 1]) { verifyCmd   = args[++i]!; continue }
    if (a === '--apply')   { apply   = true; continue }
    if (a === '--verify')  { verify  = true; continue }
    if (a === '--commit')  { commit  = true; apply = true; continue }
    if (a === '--dry-run') { dryRun  = true; continue }
  }

  if (!planId && !patchId) {
    console.error('Usage: execute --plan <planId> [--approve-hash <hash>] [--apply] [--verify] [--commit]')
    console.error('       execute --patch <patchId> --approve-hash <hash> [--apply] [--verify] [--commit]')
    process.exit(1)
  }

  return { planId, patchId, approveHash, endpoint, maxFiles, plansDir, patchesDir, apply, verify, verifyCmd, commit, dryRun }
}

async function runCommand(cmd: string, cwd: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const [bin, ...args] = cmd.split(' ')
  try {
    const { stdout, stderr } = await execFileAsync(bin!, args, { cwd, timeout: 120_000 })
    return { exitCode: 0, stdout, stderr }
  } catch (err: unknown) {
    const e = err as { code?: number; stdout?: string; stderr?: string }
    return {
      exitCode: typeof e.code === 'number' ? e.code : 1,
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? '',
    }
  }
}

async function run(argv: string[]): Promise<void> {
  const args = parseArgs(argv)

  // ── Resume path: patchId provided, skip generation ─────────────────────────
  if (args.patchId) {
    await applyPath(args, args.patchId)
    return
  }

  // ── Generation path: planId → generate patch via agent delegation ──────────
  const plan = await readPlan(args.plansDir, args.planId!).catch(err => {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  })

  const files = await collectFiles(plan.repoPath, { maxFiles: args.maxFiles })
  const prompt = buildPatchPrompt({ plan, files, repoPath: plan.repoPath })

  if (args.dryRun) {
    console.log('=== DRY RUN — patch prompt only ===\n')
    console.log(prompt)
    process.exit(0)
  }

  const client = new RohinikClient({ endpoint: args.endpoint, timeoutMs: resolveTimeoutMs() })
  // SDK client for async execution polling — TASK-6: first dogfooding
  const sdkClient = createRohinikClient({ baseUrl: args.endpoint, timeoutMs: resolveTimeoutMs() })

  // Health check
  // ponytail: same 10-line pattern as plan.ts — FRICTION-002
  try {
    const health = await client.health()
    if (health.state !== 'READY' && health.state !== 'DEGRADED') {
      console.error(`Error: Rohinik not ready (state=${health.state})`)
      process.exit(1)
    }
  } catch (err) {
    const msg = err instanceof RohinikError ? err.message : String(err)
    console.error(`Error: cannot reach Rohinik at ${args.endpoint}: ${msg}`)
    process.exit(1)
  }

  // Agent delegation: same 6-step boilerplate as plan.ts — FRICTION-007
  let diff: string
  let executionId: string
  let coordRunId: string
  let evidenceCount = 0

  try {
    const [coordAdmit, workerAdmit] = await Promise.all([
      client.agentAdmit({ instanceId: COORD_INSTANCE }),
      client.agentAdmit({ instanceId: WORKER_INSTANCE }),
    ])
    coordRunId = coordAdmit.runId
    const workerRunId = workerAdmit.runId

    await client.agentStart(coordRunId)

    const delegation = await client.agentDelegate(coordRunId, {
      delegateeRunId:      workerRunId,
      taskId:              `patch-${randomUUID()}`,
      description:         prompt,
      grantedCapabilities: ['text-generation'],
      grantedActions:      ['read'],
      grantedDepth:        0,
      maxCostUsd:          10,
      // ponytail: no cancellation mechanism, so we set a hard latency ceiling — FRICTION-013
      maxLatencyMs:        120_000,
      maxTokens:           150_000,
    })

    await client.delegationAccept(delegation.delegatedTaskId)

    // 202 — fire-and-forget; returns executionId immediately
    const runResp = await client.delegationRun(delegation.delegatedTaskId)
    executionId = runResp.executionId

    // Wait for result via SDK — polls until terminal, throws typed error on failure/cancellation
    const execution = sdkClient.executions.attach(executionId)
    const result = await execution.waitForResult({
      pollIntervalMs: 500,
      timeoutMs:      resolveTimeoutMs(),
    })
    // FRICTION-012: output is unknown — must String() with no schema validation
    diff = String(result.output)

    // Accept result; coordinator returns RUNNING
    await client.delegationAcceptResult(delegation.delegatedTaskId)

    // Collect evidence — non-critical
    try {
      const evidence = await client.agentEvidence(coordRunId)
      evidenceCount = evidence.events.length
    } catch {
      // ponytail: evidence fetch failure is non-fatal; gap documented as FRICTION-014
    }
  } catch (err) {
    const isRohinikErr = err instanceof RohinikError || err instanceof RohinikClientError
    const msg = isRohinikErr
      ? `[${(err as RohinikError).code ?? (err as RohinikClientError).status ?? 'ERR'}] ${err.message}`
      : String(err)
    console.error(`Error: agent delegation failed: ${msg}`)
    process.exit(1)
  }

  // Persist patch artifact
  const patchId = newPatchId()
  const diffHash = hashDiff(diff)

  await writePatch(args.patchesDir, {
    patchId,
    planId:        args.planId!,
    createdAt:     new Date().toISOString(),
    repoPath:      plan.repoPath,
    diff,
    diffHash,
    executionId,
    agentRunId:    coordRunId!,
    evidenceCount,
    status:        'proposed',
  })

  // Show the diff to the human
  console.log('\n=== Proposed Patch ===\n')
  console.log(diff)
  console.log('\n=== Patch Saved ===')
  console.log(`Patch ID       : ${patchId}`)
  console.log(`Diff hash      : sha256:${diffHash}`)
  console.log(`Evidence events: ${evidenceCount}`)
  console.log(`Location       : ${join(args.patchesDir, patchId + '.json')}`)

  if (!args.approveHash) {
    console.log('\n--- Approval required to apply ---')
    console.log(`Review the diff above, then run:`)
    console.log(`  execute --patch ${patchId} --approve-hash sha256:${diffHash} --apply`)
    console.log(`  (add --verify to run tests, --commit to git-commit after verification)`)
    return
  }

  await applyPath({ ...args, patchesDir: args.patchesDir }, patchId)
}

async function applyPath(args: ExecuteArgs, patchId: string): Promise<void> {
  const patch = await readPatch(args.patchesDir, patchId).catch(err => {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  })

  // Validate approval hash
  const rawHash = args.approveHash?.startsWith('sha256:') ? args.approveHash.slice(7) : args.approveHash
  if (!rawHash) {
    console.error('Error: --approve-hash required to apply patch')
    console.error(`  Patch diff hash: sha256:${patch.diffHash}`)
    console.error(`  Run with: --approve-hash sha256:${patch.diffHash} --apply`)
    process.exit(1)
  }
  if (rawHash !== patch.diffHash) {
    console.error('Error: patch hash mismatch — patch may have been modified')
    console.error(`  Expected : sha256:${patch.diffHash}`)
    console.error(`  Provided : sha256:${rawHash}`)
    process.exit(1)
  }

  // Record approval
  await writePatchApproval(args.patchesDir, {
    patchId,
    approvedAt:  new Date().toISOString(),
    approveHash: rawHash,
    contentHash: patch.diffHash,
  })
  await updatePatchStatus(args.patchesDir, patchId, 'approved')

  console.log(`Patch approved: ${patchId}`)

  if (!args.apply) {
    console.log('\n--- Apply gate ---')
    console.log('Patch approved but NOT applied (--apply flag not set).')
    console.log(`To apply: execute --patch ${patchId} --approve-hash sha256:${rawHash} --apply`)
    return
  }

  // Write diff to temp file for git apply
  const tmpDiff = join(args.patchesDir, `${patchId}.diff`)
  await writeFile(tmpDiff, patch.diff, 'utf-8')

  console.log('\n--- Applying patch ---')
  console.log(`  git apply ${tmpDiff}`)

  const applyResult = await runCommand(`git apply ${tmpDiff}`, patch.repoPath)

  await writePatchApplication(args.patchesDir, {
    patchId,
    appliedAt: new Date().toISOString(),
    appliedBy: 'git apply',
    exitCode:  applyResult.exitCode,
    stdout:    applyResult.stdout,
    stderr:    applyResult.stderr,
  })

  if (applyResult.exitCode !== 0) {
    console.error('\nPatch application FAILED:')
    if (applyResult.stderr) console.error(applyResult.stderr)
    if (applyResult.stdout) console.log(applyResult.stdout)
    await updatePatchStatus(args.patchesDir, patchId, 'rejected')
    // ponytail: no rollback mechanism exposed by Rohinik — FRICTION-015
    process.exit(1)
  }

  console.log('Patch applied.')
  await updatePatchStatus(args.patchesDir, patchId, 'applied')

  if (!args.verify) {
    console.log('\n--- Verify gate ---')
    console.log('Patch applied but NOT verified (--verify flag not set).')
    console.log(`To verify: execute --patch ${patchId} --approve-hash sha256:${rawHash} --apply --verify`)
    return
  }

  // Run verification
  console.log(`\n--- Running verification: ${args.verifyCmd} ---`)
  const verifyResult = await runCommand(args.verifyCmd, patch.repoPath)

  await writePatchVerification(args.patchesDir, {
    patchId,
    verifiedAt: new Date().toISOString(),
    command:    args.verifyCmd,
    exitCode:   verifyResult.exitCode,
    stdout:     verifyResult.stdout,
    stderr:     verifyResult.stderr,
    passed:     verifyResult.exitCode === 0,
  })

  if (verifyResult.exitCode !== 0) {
    console.error('\nVerification FAILED:')
    // ponytail: stdout/stderr from test runner may be very long — FRICTION-014
    const lines = (verifyResult.stdout + '\n' + verifyResult.stderr).trim().split('\n')
    const tail = lines.slice(-30).join('\n')
    console.error(tail)
    await updatePatchStatus(args.patchesDir, patchId, 'rejected')
    process.exit(1)
  }

  console.log('Verification passed.')
  await updatePatchStatus(args.patchesDir, patchId, 'verified')

  if (!args.commit) {
    console.log('\n--- Commit gate ---')
    console.log('Verified but NOT committed (--commit flag not set).')
    console.log(`To commit: execute --patch ${patchId} --approve-hash sha256:${rawHash} --apply --verify --commit`)
    return
  }

  // Git commit — user must explicitly opt in
  const commitMsg = `feat(repo-engineer): apply patch ${patchId}\n\nGenerated by repo-engineer Phase D from plan ${patch.planId}.`
  const commitResult = await runCommand(`git commit -am "${commitMsg}"`, patch.repoPath)
  if (commitResult.exitCode !== 0) {
    console.error('\nGit commit FAILED:')
    console.error(commitResult.stderr)
    process.exit(1)
  }

  console.log('\n=== Execution Complete ===')
  console.log(`Patch    : ${patchId}`)
  console.log(`Status   : verified + committed`)
  console.log(`Evidence : ${join(args.patchesDir, patchId + '.json')}`)
  console.log('\nNote: push requires explicit git push — not automated.')
}

run(process.argv).catch((err: unknown) => {
  console.error('Unexpected error:', err instanceof Error ? err.message : String(err))
  process.exit(1)
})
