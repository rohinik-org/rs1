/**
 * Phase D: execute — generate patch, approve, apply, verify, evidence
 *
 * T9 migration: approval/apply/verify/recovery now route through the RS1 control plane
 * via @rohinik-org/control SDK. Local JSON sidecars for those operations removed.
 *
 * Gates (all fail-closed by default):
 *   patch generation : always runs (read-only)
 *   --apply          : register artifact + request approval + apply via control plane
 *   --verify         : run verification and submit result to control plane
 *   --recover        : issue REVERSE_PATCH recovery after verification failure
 *   --commit         : git commit (implies --apply + --verify must have passed)
 *
 * Patch diff still persisted locally (<patches-dir>/<patchId>.json).
 * Control plane IDs (artifactId, workflowId) stored in that same file after registration.
 */

import { resolve, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { writeFile } from 'node:fs/promises'
import { RohinikClient } from '../client/rohinik-client.js'
import { RohinikError } from '../client/types.js'
import { createRohinikClient, RohinikClientError } from '@rohinik-org/client'
import { admit, AgentSdkError } from '@rohinik-org/agent'
import { createControlClient, ControlSdkError } from '@rohinik-org/control'
import { MutationOutcome, RecoveryStrategy, VerificationStatus } from '@rohinik-org/control-protocol-v1'
import { collectFiles } from '../pipeline/file-collector.js'
import { buildPatchPrompt } from '../pipeline/patch-builder.js'
import { streamExecution } from '../pipeline/stream-execution.js'
import {
  hashDiff, newPatchId, writePatch, readPatch, updatePatchStatus,
} from '../pipeline/patch-store.js'
import { readPlan } from '../pipeline/plan-store.js'
import { resolveEndpoint, resolveTimeoutMs } from '../config.js'

const execFileAsync = promisify(execFile)

const COORD_INSTANCE  = 'inst-coordinator-1'
const WORKER_INSTANCE = 'inst-worker-1'

interface ExecuteArgs {
  planId:        string | undefined
  patchId:       string | undefined   // resume: skip generation, go to apply
  approveHash:   string | undefined   // required to apply (must match diffHash)
  operatorId:    string               // human operator identity for approval record
  plansDir:      string
  patchesDir:    string
  endpoint:      string
  maxFiles:      number
  apply:         boolean              // flag: apply diff to disk via control plane
  verify:        boolean              // flag: run verification and submit to control plane
  verifyCmd:     string               // default: 'pnpm test'
  recover:       boolean              // flag: issue REVERSE_PATCH after verification failure
  commit:        boolean              // flag: git commit after verified apply
  dryRun:        boolean              // generate only, no server call
}

function parseArgs(argv: string[]): ExecuteArgs {
  const args = argv.slice(2)
  let planId: string | undefined
  let patchId: string | undefined
  let approveHash: string | undefined
  let operatorId = process.env['ROHINIK_OPERATOR_ID'] ?? 'operator'
  let endpoint = resolveEndpoint()
  let maxFiles = 20
  let plansDir = resolve('plans')
  let patchesDir = resolve('patches')
  let apply = false
  let verify = false
  let verifyCmd = 'pnpm test'
  let recover = false
  let commit = false
  let dryRun = false

  for (let i = 0; i < args.length; i++) {
    const a = args[i]!
    if (a === '--plan'         && args[i + 1]) { planId      = args[++i]!; continue }
    if (a === '--patch'        && args[i + 1]) { patchId     = args[++i]!; continue }
    if (a === '--approve-hash' && args[i + 1]) { approveHash = args[++i]!; continue }
    if (a === '--operator-id'  && args[i + 1]) { operatorId  = args[++i]!; continue }
    if (a === '--endpoint'     && args[i + 1]) { endpoint    = args[++i]!; continue }
    if (a === '--max-files'    && args[i + 1]) { maxFiles    = parseInt(args[++i]!, 10); continue }
    if (a === '--plans-dir'    && args[i + 1]) { plansDir    = resolve(args[++i]!); continue }
    if (a === '--patches-dir'  && args[i + 1]) { patchesDir  = resolve(args[++i]!); continue }
    if (a === '--verify-cmd'   && args[i + 1]) { verifyCmd   = args[++i]!; continue }
    if (a === '--apply')   { apply   = true; continue }
    if (a === '--verify')  { verify  = true; continue }
    if (a === '--recover') { recover = true; continue }
    if (a === '--commit')  { commit  = true; apply = true; continue }
    if (a === '--dry-run') { dryRun  = true; continue }
  }

  if (!planId && !patchId) {
    console.error('Usage: execute --plan <planId> [--approve-hash <hash>] [--operator-id <id>] [--apply] [--verify] [--recover] [--commit]')
    console.error('       execute --patch <patchId> --approve-hash <hash> [--operator-id <id>] [--apply] [--verify] [--recover] [--commit]')
    process.exit(1)
  }

  return { planId, patchId, approveHash, operatorId, endpoint, maxFiles, plansDir, patchesDir, apply, verify, verifyCmd, recover, commit, dryRun }
}

async function runCommand(cmd: string, cwd: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const [bin, ...cmdArgs] = cmd.split(' ')
  try {
    const { stdout, stderr } = await execFileAsync(bin!, cmdArgs, { cwd, timeout: 120_000 })
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

async function captureCheckpoint(repoPath: string, checkpointId: string): Promise<{
  checkpointId:    string
  capturedAt:      string
  headRef:         string
  workingTreeHash: string
  indexHash:       string
  dirtyState: {
    hasUncommittedChanges: boolean
    stagedFileCount:       number
    unstagedFileCount:     number
    untrackedFileCount:    number
    files:                 string[]
  }
}> {
  const capturedAt = new Date().toISOString()

  const headResult = await runCommand('git rev-parse HEAD', repoPath)
  const headRef = headResult.stdout.trim() || 'unknown'

  const wtResult  = await runCommand('git write-tree', repoPath)
  const workingTreeHash = wtResult.stdout.trim() || headRef

  // index hash via git stash --include-untracked dry-run isn't trivial; use status hash
  const indexHash = workingTreeHash

  const statusResult = await runCommand('git status --porcelain', repoPath)
  const statusLines  = statusResult.stdout.trim().split('\n').filter(Boolean)
  const staged   = statusLines.filter(l => l[0] !== ' ' && l[0] !== '?').length
  const unstaged = statusLines.filter(l => l[1] !== ' ' && l[0] !== '?').length
  const untracked = statusLines.filter(l => l.startsWith('??')).length
  const files = statusLines.map(l => l.slice(3).trim())

  return {
    checkpointId,
    capturedAt,
    headRef,
    workingTreeHash,
    indexHash,
    dirtyState: {
      hasUncommittedChanges: statusLines.length > 0,
      stagedFileCount:   staged,
      unstagedFileCount: unstaged,
      untrackedFileCount: untracked,
      files,
    },
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

  const files  = await collectFiles(plan.repoPath, { maxFiles: args.maxFiles })
  const prompt = buildPatchPrompt({ plan, files, repoPath: plan.repoPath })

  if (args.dryRun) {
    console.log('=== DRY RUN — patch prompt only ===\n')
    console.log(prompt)
    process.exit(0)
  }

  const client    = new RohinikClient({ endpoint: args.endpoint, timeoutMs: resolveTimeoutMs() })
  const sdkClient = createRohinikClient({ baseUrl: args.endpoint, timeoutMs: resolveTimeoutMs() })

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

  let diff: string
  let executionId: string
  let coordRunId: string
  let evidenceCount = 0

  try {
    const [coord, worker] = await Promise.all([
      admit(args.endpoint, COORD_INSTANCE),
      admit(args.endpoint, WORKER_INSTANCE),
    ])
    coordRunId = coord.run.runId

    await coord.run.start()

    const delegation = await coord.run.delegate({
      delegateeRunId:      worker.run.runId,
      taskId:              `patch-${randomUUID()}`,
      description:         prompt,
      grantedCapabilities: ['text-generation'],
      grantedActions:      ['read'],
      grantedDepth:        0,
      maxCostUsd:          10,
      maxLatencyMs:        120_000,
      maxTokens:           150_000,
    })

    await delegation.accept()

    const execHandle = await delegation.run()
    executionId = execHandle.executionId

    const execution = sdkClient.executions.attach(executionId)
    const outcome   = await streamExecution(execution, {
      onEvent: (e) => {
        const kind = (e as unknown as { kind: string }).kind
        process.stderr.write(`  [event] ${kind}\n`)
      },
      onStreamModeChange: (mode) => {
        process.stderr.write(`  [transport] switched to ${mode}\n`)
      },
      onCancellationRequested: () => {
        process.stderr.write(`  [event] cancellation requested — waiting for terminal\n`)
      },
    })

    if (outcome.status === 'cancelled') {
      console.error('Error: execution was cancelled')
      process.exit(1)
    }
    if (outcome.status === 'failed') {
      console.error(`Error: execution failed: ${outcome.error.message}`)
      process.exit(1)
    }

    const result = await execution.result()
    if (typeof result.output !== 'string') {
      throw new Error(`Agent returned non-string output (${typeof result.output}) — expected unified diff`)
    }
    diff = result.output

    await delegation.acceptResult()

    try {
      const evidence = await coord.run.evidence()
      evidenceCount  = evidence.events.length
    } catch {
      // ponytail: evidence fetch failure is non-fatal
    }
  } catch (err) {
    const isKnown = err instanceof RohinikError || err instanceof RohinikClientError || err instanceof AgentSdkError
    const msg     = isKnown
      ? `[${(err as RohinikError).code ?? (err as RohinikClientError).status ?? (err as AgentSdkError).status ?? 'ERR'}] ${err.message}`
      : String(err)
    console.error(`Error: agent delegation failed: ${msg}`)
    process.exit(1)
  }

  const patchId  = newPatchId()
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

  console.log('\n=== Proposed Patch ===\n')
  console.log(diff)
  console.log('\n=== Patch Saved ===')
  console.log(`Patch ID       : ${patchId}`)
  console.log(`Diff hash      : sha256:${diffHash}`)
  console.log(`Evidence events: ${evidenceCount}`)
  console.log(`Location       : ${join(args.patchesDir, patchId + '.json')}`)

  if (!args.approveHash) {
    console.log('\n--- Approval required to apply ---')
    console.log('Review the diff above, then run:')
    console.log(`  execute --patch ${patchId} --approve-hash sha256:${diffHash} --apply`)
    console.log(`  (add --verify to run tests, --recover to auto-recover on failure, --commit to git-commit after verification)`)
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
    process.exit(1)
  }
  if (rawHash !== patch.diffHash) {
    console.error('Error: patch hash mismatch — patch may have been modified')
    console.error(`  Expected : sha256:${patch.diffHash}`)
    console.error(`  Provided : sha256:${rawHash}`)
    process.exit(1)
  }

  // ── Register artifact + approve via control plane ───────────────────────────
  const control = createControlClient(args.endpoint)

  let controlArtifactId = patch.controlArtifactId
  let controlWorkflowId = patch.controlWorkflowId

  if (!args.apply) {
    console.log(`Patch approved (hash confirmed): ${patchId}`)
    console.log('\n--- Apply gate ---')
    console.log('Patch hash confirmed but NOT applied (--apply flag not set).')
    console.log(`To apply: execute --patch ${patchId} --approve-hash sha256:${rawHash} --apply`)
    return
  }

  // Register the diff as a control artifact (idempotent via patchId scope)
  let artifact: Awaited<ReturnType<typeof control.artifacts.create>>
  try {
    artifact = await control.artifacts.create({
      actionType:  'FILE_PATCH',
      scope:       patch.repoPath,
      content:     patch.diff,
      evidenceRef: patch.executionId,
    })
    controlArtifactId = artifact.id
    console.log(`Control artifact registered: ${artifact.id}`)
    console.log(`  contentHash: ${artifact.contentHash}`)
  } catch (err) {
    const msg = err instanceof ControlSdkError ? `[${err.code ?? err.status}] ${err.message}` : String(err)
    console.error(`Error: artifact registration failed: ${msg}`)
    process.exit(1)
  }

  // Approve the artifact (operator supplies rationale)
  let approvalId: string
  try {
    const decision = await artifact.approve({
      operatorId: args.operatorId,
      rationale:  `Operator-approved patch ${patchId} for plan ${patch.planId}`,
    })
    approvalId = decision.approvalId
    console.log(`Artifact approved: ${approvalId}`)
  } catch (err) {
    const msg = err instanceof ControlSdkError ? `[${err.code ?? err.status}] ${err.message}` : String(err)
    console.error(`Error: artifact approval failed: ${msg}`)
    process.exit(1)
  }

  // Create workflow
  let workflowId: string
  try {
    const workflow = await control.workflows.create(artifact.id, {
      idempotencyKey: patchId,
    })
    workflowId        = workflow.id
    controlWorkflowId = workflow.id
    console.log(`Control workflow created: ${workflowId}`)
  } catch (err) {
    const msg = err instanceof ControlSdkError ? `[${err.code ?? err.status}] ${err.message}` : String(err)
    console.error(`Error: workflow creation failed: ${msg}`)
    process.exit(1)
  }

  // Persist control IDs to patch file
  const updatedPatch = { ...patch, controlArtifactId, controlWorkflowId, status: 'approved' as const }
  await writeFile(join(args.patchesDir, `${patchId}.json`), JSON.stringify(updatedPatch, null, 2), 'utf-8')

  // ── Capture pre-mutation checkpoint ────────────────────────────────────────
  const checkpointId = randomUUID()
  const checkpoint   = await captureCheckpoint(patch.repoPath, checkpointId)
  console.log(`\nCheckpoint captured: ${checkpointId}`)
  console.log(`  headRef: ${checkpoint.headRef}`)
  console.log(`  dirty: ${checkpoint.dirtyState.hasUncommittedChanges}`)

  // ── Apply patch to disk ─────────────────────────────────────────────────────
  const tmpDiff = join(args.patchesDir, `${patchId}.diff`)
  await writeFile(tmpDiff, patch.diff, 'utf-8')

  console.log('\n--- Applying patch ---')
  console.log(`  git apply ${tmpDiff}`)

  const applyResult = await runCommand(`git apply ${tmpDiff}`, patch.repoPath)

  const mutationOutcome: MutationOutcome = applyResult.exitCode === 0
    ? MutationOutcome.APPLIED
    : MutationOutcome.PARTIAL  // git apply partial failure (--reject would leave .rej files)

  const applyRecord = {
    artifactId:      artifact.id,
    appliedAt:       new Date().toISOString(),
    method:          'git apply',
    exitCode:        applyResult.exitCode,
    stdout:          applyResult.stdout.slice(0, 500),
    stderr:          applyResult.stderr.slice(0, 500),
    mutationOutcome,
    checkpointId,
  }

  // Submit apply result to control plane
  let workflow: Awaited<ReturnType<typeof control.workflows.load>>
  try {
    workflow = await control.workflows.load(workflowId)
    await workflow.apply({ approvalId, checkpoint, applyRecord })
    console.log(`Control workflow state: ${workflow.state}`)
  } catch (err) {
    const msg = err instanceof ControlSdkError ? `[${err.code ?? err.status}] ${err.message}` : String(err)
    console.error(`Error: control plane apply failed: ${msg}`)
    process.exit(1)
  }

  if (applyResult.exitCode !== 0) {
    console.error('\nPatch application FAILED:')
    if (applyResult.stderr) console.error(applyResult.stderr)
    await updatePatchStatus(args.patchesDir, patchId, 'rejected')
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

  // ── Run verification ────────────────────────────────────────────────────────
  console.log(`\n--- Running verification: ${args.verifyCmd} ---`)
  const verifyStart  = new Date()
  const verifyResult = await runCommand(args.verifyCmd, patch.repoPath)
  const verifyEnd    = new Date()

  const verifyStatus: VerificationStatus = verifyResult.exitCode === 0
    ? VerificationStatus.PASSED
    : VerificationStatus.FAILED

  // Submit verification result to control plane
  let verificationPassed = false
  try {
    const vr = await workflow.verify({
      command:         args.verifyCmd,
      verifierId:      'repo-engineer',
      verifierVersion: '0.1.0',
      startedAt:       verifyStart.toISOString(),
      finishedAt:      verifyEnd.toISOString(),
      durationMs:      verifyEnd.getTime() - verifyStart.getTime(),
      exitCode:        verifyResult.exitCode,
      status:          verifyStatus,
      checks:          [],
      timedOut:        false,
      ...(verifyResult.stderr && { diagnostics: verifyResult.stderr.slice(0, 500) }),
    })
    verificationPassed = vr.status === VerificationStatus.PASSED
    console.log(`Verification result: ${vr.status} (workflow: ${workflow.state})`)
  } catch (err) {
    const msg = err instanceof ControlSdkError ? `[${err.code ?? err.status}] ${err.message}` : String(err)
    console.error(`Error: control plane verify failed: ${msg}`)
    process.exit(1)
  }

  if (!verificationPassed) {
    console.error('\nVerification FAILED:')
    const lines = (verifyResult.stdout + '\n' + verifyResult.stderr).trim().split('\n')
    console.error(lines.slice(-30).join('\n'))
    await updatePatchStatus(args.patchesDir, patchId, 'rejected')

    if (!args.recover) {
      console.error('\n--- Recovery gate ---')
      console.error('Verification failed. Use --recover to attempt REVERSE_PATCH recovery.')
      process.exit(1)
    }

    // ── Issue REVERSE_PATCH recovery ──────────────────────────────────────────
    console.log('\n--- Issuing REVERSE_PATCH recovery ---')
    const recoverStart = new Date()
    const recoverResult = await runCommand(`git apply --reverse ${tmpDiff}`, patch.repoPath)
    const recoverEnd    = new Date()

    try {
      await workflow.recover({
        strategy:        RecoveryStrategy.REVERSE_PATCH,
        operatorId:      args.operatorId,
        rationale:       `Auto-recovery after verification failure for patch ${patchId}`,
        contentHash:     artifact.contentHash,
        startedAt:       recoverStart.toISOString(),
        completedAt:     recoverEnd.toISOString(),
        exitCode:        recoverResult.exitCode,
        mutationOutcome: recoverResult.exitCode === 0 ? MutationOutcome.APPLIED : MutationOutcome.PARTIAL,
        succeeded:       recoverResult.exitCode === 0,
        ...(recoverResult.stderr && { diagnostics: recoverResult.stderr.slice(0, 500) }),
      })
      console.log(`Recovery state: ${workflow.state}`)
    } catch (err) {
      const msg = err instanceof ControlSdkError ? `[${err.code ?? err.status}] ${err.message}` : String(err)
      console.error(`Error: control plane recovery failed: ${msg}`)
    }

    if (recoverResult.exitCode !== 0) {
      console.error('REVERSE_PATCH failed — manual intervention required')
      if (recoverResult.stderr) console.error(recoverResult.stderr)
    } else {
      console.log('Patch reversed successfully.')
    }
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

  // Git commit
  const commitMsg = `feat(repo-engineer): apply patch ${patchId}\n\nGenerated by repo-engineer Phase D from plan ${patch.planId}.`
  const commitResult = await runCommand(`git commit -am "${commitMsg}"`, patch.repoPath)
  if (commitResult.exitCode !== 0) {
    console.error('\nGit commit FAILED:')
    console.error(commitResult.stderr)
    process.exit(1)
  }

  // Fetch final evidence from control plane (non-critical)
  try {
    const evidence = await workflow.evidence()
    console.log(`\nControl plane evidence: ${evidence.events.length} events`)
  } catch {
    // ponytail: evidence fetch failure is non-fatal
  }

  console.log('\n=== Execution Complete ===')
  console.log(`Patch     : ${patchId}`)
  console.log(`Artifact  : ${artifact.id}`)
  console.log(`Workflow  : ${workflowId}`)
  console.log(`Status    : verified + committed`)
  console.log('\nNote: push requires explicit git push — not automated.')
}

run(process.argv).catch((err: unknown) => {
  console.error('Unexpected error:', err instanceof Error ? err.message : String(err))
  process.exit(1)
})
