import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomBytes } from 'node:crypto'
import { hashPlan, newPlanId, writePlan, readPlan, writeApproval } from '../pipeline/plan-store.js'
import type { PlanArtifact } from '../pipeline/plan-store.js'

let tmpDir: string

beforeAll(async () => {
  tmpDir = join(tmpdir(), `ps-test-${randomBytes(4).toString('hex')}`)
  await mkdir(tmpDir, { recursive: true })
})

afterAll(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

function makeArtifact(planId = newPlanId(), content = 'plan content here'): PlanArtifact {
  return {
    planId,
    createdAt: new Date().toISOString(),
    repoPath: '/repo',
    request: 'Add logging',
    files: ['src/index.ts'],
    content,
    requestId: 'req-1',
    tierId: 'REASONING',
    executionTimeMs: 10,
    hash: hashPlan(content),
  }
}

describe('plan-store', () => {
  it('writePlan + readPlan roundtrips all fields', async () => {
    const artifact = makeArtifact()
    await writePlan(tmpDir, artifact)
    const loaded = await readPlan(tmpDir, artifact.planId)
    expect(loaded).toEqual(artifact)
  })

  it('hashPlan is deterministic', () => {
    expect(hashPlan('hello')).toBe(hashPlan('hello'))
  })

  it('hashPlan changes on single char diff', () => {
    expect(hashPlan('hello')).not.toBe(hashPlan('hellox'))
  })

  it('writeApproval writes <planId>.approved.json', async () => {
    const planId = newPlanId()
    const { readFile } = await import('node:fs/promises')
    await writeApproval(tmpDir, {
      planId,
      approvedAt: new Date().toISOString(),
      approveHash: 'abc',
      contentHash: 'abc',
    })
    const raw = await readFile(join(tmpDir, `${planId}.approved.json`), 'utf-8')
    const parsed = JSON.parse(raw) as { planId: string }
    expect(parsed.planId).toBe(planId)
  })

  it('readPlan throws on unknown planId', async () => {
    await expect(readPlan(tmpDir, 'no-such-id')).rejects.toThrow('Plan not found')
  })
})
