import { stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { RohinikClient } from '../client/rohinik-client.js'
import { RohinikError } from '../client/types.js'
import { collectFiles } from '../pipeline/file-collector.js'
import { buildAssessmentPrompt } from '../pipeline/assessment-builder.js'
import { resolveEndpoint, resolveTimeoutMs } from '../config.js'

interface AssessArgs {
  repoPath: string
  objective: string
  endpoint: string
  maxFiles: number
  dryRun: boolean
}

function parseArgs(argv: string[]): AssessArgs {
  const args = argv.slice(2)
  const positional: string[] = []
  let endpoint = resolveEndpoint()
  let maxFiles = 20
  let dryRun = false

  for (let i = 0; i < args.length; i++) {
    const a = args[i]!
    if (a === '--endpoint' && args[i + 1]) { endpoint = args[++i]!; continue }
    if (a === '--max-files' && args[i + 1]) { maxFiles = parseInt(args[++i]!, 10); continue }
    if (a === '--dry-run') { dryRun = true; continue }
    positional.push(a)
  }

  const [repoPath, ...rest] = positional
  const objective = rest.join(' ')

  if (!repoPath || !objective) {
    console.error('Usage: assess <repo-path> <objective> [--endpoint <url>] [--max-files <n>] [--dry-run]')
    process.exit(1)
  }

  return { repoPath, objective, endpoint, maxFiles, dryRun }
}

async function run(argv: string[]): Promise<void> {
  const { repoPath, objective, endpoint, maxFiles, dryRun } = parseArgs(argv)
  const absPath = resolve(repoPath)

  try {
    await stat(absPath)
  } catch {
    console.error(`Error: path does not exist: ${absPath}`)
    process.exit(1)
  }

  const files = await collectFiles(absPath, { maxFiles })
  const prompt = buildAssessmentPrompt({ objective, files, repoPath: absPath })

  if (dryRun) {
    console.log('=== DRY RUN — prompt only, no server call ===\n')
    console.log(prompt)
    process.exit(0)
  }

  const client = new RohinikClient({ endpoint, timeoutMs: resolveTimeoutMs() })

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

  // Execute
  let result
  try {
    result = await client.execute({
      content: prompt,
      contentType: 'TEXT',
      constraints: { allowReasoning: true },
    })
  } catch (err) {
    const msg = err instanceof RohinikError ? `[${err.code}] ${err.message}` : String(err)
    console.error(`Error: execution failed: ${msg}`)
    process.exit(1)
  }

  console.log('\n=== Assessment ===\n')
  console.log(result.output)
  console.log('\n=== Routing ===')
  console.log(`Request ID : ${result.requestId}`)
  console.log(`Skill      : ${result.skillId}`)
  console.log(`Tier       : ${result.tierId ?? 'unknown'}`)
  console.log(`Reasoning  : ${result.reasoningInvoked}`)
  console.log(`Duration   : ${result.executionTimeMs}ms`)

  // Decision trace
  try {
    const decision = await client.getDecision(result.requestId)
    const trace = decision.trace as Record<string, unknown> | null
    if (trace) {
      const events = Array.isArray(trace) ? trace.length
        : typeof (trace as Record<string, unknown>).events === 'object'
          ? ((trace as Record<string, unknown[]>).events?.length ?? 0)
          : 0
      console.log(`Trace      : ${events} events recorded`)
    }
  } catch {
    // non-fatal
  }

  console.log('\nEvidence stored in Rohinik SQLite (automatic, server-side).')
}

run(process.argv).catch((err: unknown) => {
  console.error('Unexpected error:', err instanceof Error ? err.message : String(err))
  process.exit(1)
})
