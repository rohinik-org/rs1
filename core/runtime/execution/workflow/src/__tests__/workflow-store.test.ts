import { describe, it, expect, afterEach } from 'vitest'
import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { JsonWorkflowStore } from '../store/json-workflow-store.js'
import type { WorkflowDescriptor, WorkflowCandidateSet, WorkflowApproval, ExecutionOutcome } from '@rohinik-org/compiler'

const roots: string[] = []
async function tmpRoot(): Promise<string> {
  const dir = join(tmpdir(), `wf-store-test-${randomUUID()}`)
  await mkdir(dir, { recursive: true })
  roots.push(dir)
  return dir
}
afterEach(async () => {
  for (const r of roots) await rm(r, { recursive: true, force: true })
  roots.length = 0
})

function makeDescriptor(workflowId: string, skillIds: string[]): WorkflowDescriptor {
  return {
    kind: 'WorkflowDescriptor',
    schemaVersion: '1.0',
    workflowId,
    version: 1,
    status: 'ACTIVE',
    definition: {
      name: skillIds.join(' → '),
      steps: skillIds.map((skillId, position) => ({
        skillId,
        position,
        statistics: {
          executionCount: 10,
          outcomeDistribution: { SUCCESS: 10, FAILED: 0, NO_ROUTE: 0, TIMEOUT: 0 } as Readonly<Record<ExecutionOutcome, number>>,
          averageLatencyMs: 100,
        },
      })),
    },
    statistics: {
      confidence: 0.9,
      successRate: 0.9,
      averageLatencyMs: 100,
      evidence: { executionCount: 10, successfulExecutions: 9, failedExecutions: 1, uniqueSessions: 5 },
    },
    lineage: {
      derivedFromCandidateSetId: 'set-1',
      approvalId: 'appr-1',
      approvalPolicyId: 'AutoApprovalPolicy',
      graphRevision: 1,
      corpusRevision: 0,
      discoveredAt: '2026-01-01T00:00:00Z',
    },
  }
}

describe('JsonWorkflowStore', () => {
  it('save and list round-trips a descriptor', async () => {
    const root = await tmpRoot()
    const store = new JsonWorkflowStore(root)
    const d = makeDescriptor('wf-1', ['a', 'b'])
    await store.save(d)
    const list = await store.list()
    expect(list).toHaveLength(1)
    expect(list[0]!.workflowId).toBe('wf-1')
  })

  it('list returns empty array when no descriptors', async () => {
    const root = await tmpRoot()
    const store = new JsonWorkflowStore(root)
    expect(await store.list()).toHaveLength(0)
  })

  it('findBySkill returns workflows containing the skill', async () => {
    const root = await tmpRoot()
    const store = new JsonWorkflowStore(root)
    await store.save(makeDescriptor('wf-1', ['skill-a', 'skill-b']))
    await store.save(makeDescriptor('wf-2', ['skill-c', 'skill-d']))
    const found = await store.findBySkill('skill-a')
    expect(found).toHaveLength(1)
    expect(found[0]!.workflowId).toBe('wf-1')
  })

  it('findBySkill returns empty when skill not in any workflow', async () => {
    const root = await tmpRoot()
    const store = new JsonWorkflowStore(root)
    await store.save(makeDescriptor('wf-1', ['skill-a', 'skill-b']))
    expect(await store.findBySkill('skill-z')).toHaveLength(0)
  })

  it('save overwrites existing descriptor with same workflowId (monotonicity)', async () => {
    const root = await tmpRoot()
    const store = new JsonWorkflowStore(root)
    const d1 = makeDescriptor('wf-1', ['a', 'b'])
    const d2 = { ...d1, version: 2, statistics: { ...d1.statistics, confidence: 0.95 } }
    await store.save(d1)
    await store.save(d2)
    const list = await store.list()
    expect(list).toHaveLength(1)
    expect(list[0]!.statistics.confidence).toBe(0.95)
  })

  it('saveCandidateSet persists without error', async () => {
    const root = await tmpRoot()
    const store = new JsonWorkflowStore(root)
    const set: WorkflowCandidateSet = {
      kind: 'WorkflowCandidateSet',
      schemaVersion: '1.0',
      candidateSetId: 'set-1',
      producedAt: '2026-01-01T00:00:00Z',
      generatedBy: 'test',
      corpusWindow: { start: '2000-01-01', end: '2026-01-01' },
      recordsScanned: 100,
      chainsGenerated: 10,
      candidates: [],
    }
    await expect(store.saveCandidateSet(set)).resolves.not.toThrow()
  })

  it('saveApproval persists without error', async () => {
    const root = await tmpRoot()
    const store = new JsonWorkflowStore(root)
    const approval: WorkflowApproval = {
      kind: 'WorkflowApproval',
      schemaVersion: '1.0',
      approvalId: 'appr-1',
      candidateSetId: 'set-1',
      reviewedAt: '2026-01-01T00:00:00Z',
      policyId: 'AutoApprovalPolicy',
      thresholdUsed: 0.8,
      decisions: [],
    }
    await expect(store.saveApproval(approval)).resolves.not.toThrow()
  })
})
