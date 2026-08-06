import { resolve } from 'node:path'
import { hashPlan, readPlan, writeApproval } from '../pipeline/plan-store.js'
import { resolveEndpoint } from '../config.js'

interface ApproveArgs {
  planId: string
  approveHash: string
  plansDir: string
}

function parseArgs(argv: string[]): ApproveArgs {
  const args = argv.slice(2)
  let planId: string | undefined
  let approveHash: string | undefined
  let plansDir = resolve('plans')

  for (let i = 0; i < args.length; i++) {
    const a = args[i]!
    if (a === '--plan' && args[i + 1]) { planId = args[++i]!; continue }
    if ((a === '--approve-hash') && args[i + 1]) { approveHash = args[++i]!; continue }
    if (a === '--plans-dir' && args[i + 1]) { plansDir = resolve(args[++i]!); continue }
  }

  if (!planId || !approveHash) {
    console.error('Usage: execute --plan <planId> --approve-hash <hash> [--plans-dir <dir>]')
    process.exit(1)
  }

  return { planId, approveHash, plansDir }
}

async function run(argv: string[]): Promise<void> {
  const { planId, approveHash, plansDir } = parseArgs(argv)

  let artifact
  try {
    artifact = await readPlan(plansDir, planId)
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  }

  const recomputed = hashPlan(artifact.content)
  const provided = approveHash.startsWith('sha256:') ? approveHash.slice(7) : approveHash

  if (recomputed !== provided) {
    console.error('Error: plan hash mismatch. Plan may have been modified.')
    console.error(`  Expected : sha256:${recomputed}`)
    console.error(`  Provided : sha256:${provided}`)
    process.exit(1)
  }

  const record = {
    planId,
    approvedAt: new Date().toISOString(),
    approveHash: provided,
    contentHash: recomputed,
  }

  await writeApproval(plansDir, record)

  console.log('Plan approved.')
  console.log(`Plan ID  : ${planId}`)
  console.log(`Approved : ${record.approvedAt}`)
  console.log(`Hash     : sha256:${recomputed}`)
  console.log('\nExecution is pending Phase D implementation.')
  console.log(`Approval recorded at ${plansDir}/${planId}.approved.json`)
}

run(process.argv).catch((err: unknown) => {
  console.error('Unexpected error:', err instanceof Error ? err.message : String(err))
  process.exit(1)
})
