import { stat, mkdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { RohinikClient } from '../client/rohinik-client.js'
import { RohinikError } from '../client/types.js'
import { createRohinikClient, RohinikClientError } from '@rohinik-org/client'
import { admit, AgentSdkError } from '@rohinik-org/agent'
import { collectFiles } from '../pipeline/file-collector.js'
import { buildPlanPrompt } from '../pipeline/plan-builder.js'
import { hashPlan, newPlanId, writePlan } from '../pipeline/plan-store.js'
import { resolveEndpoint, resolveTimeoutMs } from '../config.js'

// Fixed identities seeded in the Rohinik server's MockPolicyPort
const COORD_INSTANCE = 'inst-coordinator-1'
const WORKER_INSTANCE = 'inst-worker-1'

interface PlanArgs {
  repoPath: string
  request: string
  endpoint: string
  maxFiles: number
  plansDir: string
  dryRun: boolean
}

function parseArgs(argv: string[]): PlanArgs {
  const args = argv.slice(2)
  const positional: string[] = []
  let endpoint = resolveEndpoint()
  let maxFiles = 20
  let plansDir = resolve('plans')
  let dryRun = false

  for (let i = 0; i < args.length; i++) {
    const a = args[i]!
    if (a === '--endpoint' && args[i + 1]) { endpoint = args[++i]!; continue }
    if (a === '--max-files' && args[i + 1]) { maxFiles = parseInt(args[++i]!, 10); continue }
    if (a === '--plans-dir' && args[i + 1]) { plansDir = resolve(args[++i]!); continue }
    if (a === '--dry-run') { dryRun = true; continue }
    positional.push(a)
  }

  const [repoPath, ...rest] = positional
  const request = rest.join(' ')

  if (!repoPath || !request) {
    console.error('Usage: plan <repo-path> <request> [--endpoint <url>] [--max-files <n>] [--plans-dir <dir>] [--dry-run]')
    process.exit(1)
  }

  return { repoPath, request, endpoint, maxFiles, plansDir, dryRun }
}

async function run(argv: string[]): Promise<void> {
  const { repoPath, request, endpoint, maxFiles, plansDir, dryRun } = parseArgs(argv)
  const absPath = resolve(repoPath)

  try {
    await stat(absPath)
  } catch {
    console.error(`Error: path does not exist: ${absPath}`)
    process.exit(1)
  }

  const files = await collectFiles(absPath, { maxFiles })
  const prompt = buildPlanPrompt({ request, files, repoPath: absPath })

  if (dryRun) {
    console.log('=== DRY RUN — prompt only, no server call ===\n')
    console.log(prompt)
    process.exit(0)
  }

  const client = new RohinikClient({ endpoint, timeoutMs: resolveTimeoutMs() })
  const sdkClient = createRohinikClient({ baseUrl: endpoint, timeoutMs: resolveTimeoutMs() })

  // Health check
  try {
    const health = await client.health()
    if (health.state !== 'READY' && health.state !== 'DEGRADED') {
      console.error(`Error: Rohinik not ready (state=${health.state}). Is the server running?`)
      process.exit(1)
    }
  } catch (err) {
    const msg = err instanceof RohinikError ? err.message : String(err)
    console.error(`Error: cannot reach Rohinik at ${endpoint}: ${msg}`)
    process.exit(1)
  }

  // ── Agent delegation flow ──────────────────────────────────────────────────
  let content: string
  let asyncExecutionId: string
  let coordRunId: string
  let evidenceEventCount = 0

  try {
    const [coord, worker] = await Promise.all([
      admit(endpoint, COORD_INSTANCE),
      admit(endpoint, WORKER_INSTANCE),
    ])
    coordRunId = coord.run.runId

    await coord.run.start()

    const delegationId = randomUUID()
    const taskId = `plan-${delegationId}`
    const delegation = await coord.run.delegate({
      delegateeRunId:      worker.run.runId,
      taskId,
      description:         prompt,
      delegationId,
      grantedCapabilities: ['text-generation'],
      grantedActions:      ['read'],
      grantedDepth:        0,
      maxCostUsd:          5,
      maxLatencyMs:        60_000,
      maxTokens:           100_000,
    })

    await delegation.accept()
    const execHandle = await delegation.run()
    asyncExecutionId = execHandle.executionId

    // Poll for result via SDK
    const execution = sdkClient.executions.attach(asyncExecutionId)
    const result = await execution.waitForResult({
      pollIntervalMs: 500,
      timeoutMs:      resolveTimeoutMs(),
    })
    if (typeof result.output !== 'string') {
      throw new Error(`Agent returned non-string output (${typeof result.output}) — expected plan JSON`)
    }
    content = result.output

    await delegation.acceptResult()

    // Evidence — non-critical
    try {
      const evidence = await coord.run.evidence()
      evidenceEventCount = evidence.events.length
    } catch {
      // non-fatal
    }
  } catch (err) {
    const isKnown = err instanceof RohinikError || err instanceof RohinikClientError || err instanceof AgentSdkError
    const msg = isKnown
      ? `[${(err as RohinikError).code ?? (err as RohinikClientError).status ?? (err as AgentSdkError).status ?? 'ERR'}] ${err.message}`
      : String(err)
    console.error(`Error: agent delegation failed: ${msg}`)
    process.exit(1)
  }

  const hash = hashPlan(content)
  const planId = newPlanId()

  await mkdir(plansDir, { recursive: true })
  await writePlan(plansDir, {
    planId,
    createdAt: new Date().toISOString(),
    repoPath: absPath,
    request,
    files: files.map(f => f.path),
    content,
    requestId: asyncExecutionId!,
    tierId: 'agent-delegated',
    executionTimeMs: 0,
    hash,
  })

  console.log('\n=== Implementation Plan ===\n')
  console.log(content)
  console.log('\n=== Plan Saved ===')
  console.log(`Plan ID        : ${planId}`)
  console.log(`Hash           : sha256:${hash}`)
  console.log(`Location       : ${join(plansDir, planId + '.json')}`)
  console.log(`Agent run      : ${coordRunId!}`)
  console.log(`Evidence events: ${evidenceEventCount}`)
  console.log(`\nTo approve:\n  repo-engineer execute --plan ${planId} --approve-hash sha256:${hash}`)
}

run(process.argv).catch((err: unknown) => {
  console.error('Unexpected error:', err instanceof Error ? err.message : String(err))
  process.exit(1)
})
