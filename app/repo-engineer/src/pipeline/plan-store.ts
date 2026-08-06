import { createHash, randomUUID } from 'node:crypto'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface PlanArtifact {
  planId: string
  createdAt: string
  repoPath: string
  request: string
  files: string[]
  content: string
  requestId: string
  tierId: string
  executionTimeMs: number
  hash: string
}

export interface ApprovalRecord {
  planId: string
  approvedAt: string
  approveHash: string
  contentHash: string
}

export function hashPlan(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}

export function newPlanId(): string {
  return randomUUID()
}

export async function writePlan(plansDir: string, artifact: PlanArtifact): Promise<void> {
  await mkdir(plansDir, { recursive: true })
  await writeFile(join(plansDir, `${artifact.planId}.json`), JSON.stringify(artifact, null, 2), 'utf-8')
}

export async function readPlan(plansDir: string, planId: string): Promise<PlanArtifact> {
  let text: string
  try {
    text = await readFile(join(plansDir, `${planId}.json`), 'utf-8')
  } catch {
    throw new Error(`Plan not found: ${planId}`)
  }
  return JSON.parse(text) as PlanArtifact
}

export async function writeApproval(plansDir: string, record: ApprovalRecord): Promise<void> {
  await mkdir(plansDir, { recursive: true })
  await writeFile(join(plansDir, `${record.planId}.approved.json`), JSON.stringify(record, null, 2), 'utf-8')
}
