import { describe, it, expect } from 'vitest'
import { AutoApprovalPolicy } from '../policy/auto-approval-policy.js'
import type { WorkflowCandidateSet } from '@rohinik-org/compiler'

function makeSet(candidates: Array<{ id: string; confidence: number }>): WorkflowCandidateSet {
  return {
    kind: 'WorkflowCandidateSet',
    schemaVersion: '1.0',
    candidateSetId: 'set-1',
    producedAt: '2026-01-01T00:00:00Z',
    generatedBy: 'test',
    corpusWindow: { start: '2000-01-01', end: '2026-01-01' },
    recordsScanned: 100,
    chainsGenerated: 10,
    candidates: candidates.map(c => ({
      definition: { candidateId: c.id, steps: [] },
      statistics: { confidence: c.confidence, successRate: c.confidence, averageLatencyMs: 100 },
      evidence: { executionCount: 10, successfulExecutions: 9, failedExecutions: 1, uniqueSessions: 5 },
    })),
  }
}

describe('AutoApprovalPolicy', () => {
  it('has policyId', () => {
    expect(new AutoApprovalPolicy().policyId).toBe('AutoApprovalPolicy')
  })

  it('approves candidates at or above threshold', async () => {
    const policy = new AutoApprovalPolicy(0.8)
    const result = await policy.review(
      makeSet([
        { id: 'c1', confidence: 0.8 },
        { id: 'c2', confidence: 0.9 },
      ]),
    )
    expect(result.decisions.filter(d => d.decision === 'APPROVED')).toHaveLength(2)
  })

  it('rejects candidates below threshold', async () => {
    const policy = new AutoApprovalPolicy(0.8)
    const result = await policy.review(makeSet([{ id: 'c1', confidence: 0.7 }]))
    expect(result.decisions[0]!.decision).toBe('REJECTED')
  })

  it('produces one decision per candidate', async () => {
    const policy = new AutoApprovalPolicy(0.8)
    const result = await policy.review(
      makeSet([
        { id: 'c1', confidence: 0.9 },
        { id: 'c2', confidence: 0.6 },
      ]),
    )
    expect(result.decisions).toHaveLength(2)
  })

  it('result has correct metadata', async () => {
    const policy = new AutoApprovalPolicy(0.8)
    const result = await policy.review(makeSet([{ id: 'c1', confidence: 0.9 }]))
    expect(result.kind).toBe('WorkflowApproval')
    expect(result.schemaVersion).toBe('1.0')
    expect(result.candidateSetId).toBe('set-1')
    expect(result.thresholdUsed).toBe(0.8)
    expect(result.policyId).toBe('AutoApprovalPolicy')
  })

  it('default threshold is 0.8', async () => {
    const policy = new AutoApprovalPolicy()
    const result = await policy.review(makeSet([{ id: 'c1', confidence: 0.79 }]))
    expect(result.decisions[0]!.decision).toBe('REJECTED')
  })
})
