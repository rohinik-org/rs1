import { createHash, randomUUID } from 'node:crypto'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface PatchArtifact {
  patchId:         string
  planId:          string
  createdAt:       string
  repoPath:        string
  diff:            string          // raw unified diff string
  diffHash:        string          // sha256 of diff content
  executionId:     string          // from delegation run
  agentRunId:      string          // coordRunId for evidence link
  evidenceCount:   number
  status:          'proposed' | 'approved' | 'applied' | 'verified' | 'rejected'
}

export interface PatchApprovalRecord {
  patchId:     string
  approvedAt:  string
  approveHash: string             // must match diffHash
  contentHash: string
}

export interface PatchApplicationRecord {
  patchId:     string
  appliedAt:   string
  appliedBy:   string             // 'git apply'
  exitCode:    number
  stdout:      string
  stderr:      string
}

export interface PatchVerificationRecord {
  patchId:        string
  verifiedAt:     string
  command:        string
  exitCode:       number
  stdout:         string
  stderr:         string
  passed:         boolean
}

export function hashDiff(diff: string): string {
  return createHash('sha256').update(diff, 'utf8').digest('hex')
}

export function newPatchId(): string {
  return `patch-${randomUUID()}`
}

export async function writePatch(dir: string, artifact: PatchArtifact): Promise<void> {
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, `${artifact.patchId}.json`), JSON.stringify(artifact, null, 2), 'utf-8')
}

export async function readPatch(dir: string, patchId: string): Promise<PatchArtifact> {
  let text: string
  try {
    text = await readFile(join(dir, `${patchId}.json`), 'utf-8')
  } catch {
    throw new Error(`Patch not found: ${patchId}`)
  }
  return JSON.parse(text) as PatchArtifact
}

export async function updatePatchStatus(dir: string, patchId: string, status: PatchArtifact['status']): Promise<void> {
  const artifact = await readPatch(dir, patchId)
  artifact.status = status
  await writeFile(join(dir, `${patchId}.json`), JSON.stringify(artifact, null, 2), 'utf-8')
}

export async function writePatchApproval(dir: string, record: PatchApprovalRecord): Promise<void> {
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, `${record.patchId}.approved.json`), JSON.stringify(record, null, 2), 'utf-8')
}

export async function writePatchApplication(dir: string, record: PatchApplicationRecord): Promise<void> {
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, `${record.patchId}.applied.json`), JSON.stringify(record, null, 2), 'utf-8')
}

export async function writePatchVerification(dir: string, record: PatchVerificationRecord): Promise<void> {
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, `${record.patchId}.verified.json`), JSON.stringify(record, null, 2), 'utf-8')
}

export async function readPatchApproval(dir: string, patchId: string): Promise<PatchApprovalRecord | null> {
  try {
    const text = await readFile(join(dir, `${patchId}.approved.json`), 'utf-8')
    return JSON.parse(text) as PatchApprovalRecord
  } catch {
    return null
  }
}
