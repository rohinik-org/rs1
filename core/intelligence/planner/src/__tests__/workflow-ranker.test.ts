import { describe, it, expect } from 'vitest'
import { WorkflowRanker } from '../ranking/workflow-ranker.js'
import { DEFAULT_PLANNING_POLICY } from '../ranking/planning-policy.js'
import type { WorkflowMatchEvidence, CapabilityPlanEvidence, WorkflowDescriptor } from '@rohinik-org/compiler'

function makeDescriptor(id: string, confidence: number): WorkflowDescriptor {
  return {
    kind: 'WorkflowDescriptor',
    schemaVersion: '1.0',
    workflowId: id,
    version: 1,
    status: 'ACTIVE',
    definition: { name: id, steps: [{ skillId: 'skill-a', position: 0, statistics: { executionCount: 5, outcomeDistribution: { SUCCESS: 5, FAILED: 0, NO_ROUTE: 0, TIMEOUT: 0 }, averageLatencyMs: 100 } }] },
    statistics: { confidence, successRate: 1.0, averageLatencyMs: 100, evidence: { executionCount: 5, successfulExecutions: 5, failedExecutions: 0, uniqueSessions: 3 } },
    lineage: { derivedFromCandidateSetId: 'cs', approvalId: 'ap', approvalPolicyId: 'pol', graphRevision: 1, corpusRevision: 1, discoveredAt: '2026-01-01T00:00:00.000Z' },
  }
}

describe('WorkflowRanker', () => {
  const ranker = new WorkflowRanker(DEFAULT_PLANNING_POLICY)

  it('ranks DISCOVERED higher than SYNTHESIZED with equal raw scores', () => {
    const discovered: WorkflowMatchEvidence = {
      workflowId: 'wf-discovered',
      descriptor: makeDescriptor('wf-discovered', 0.9),
      matchedConcepts: ['read'],
      unmatchedConcepts: [],
      rawMatchScore: 0.9,
    }
    const synthesized: CapabilityPlanEvidence = {
      graphPaths: ['skill-a → skill-b'],
      selectedCapabilities: ['skill-a', 'skill-b'],
      missingCapabilities: [],
      synthesizedSteps: [{ skillId: 'skill-a', graphPath: 'skill-a → skill-b', rationale: 'test' }],
      coverageScore: 0.9,
      confidence: 0.9,
    }
    const candidates = ranker.rank([discovered], [synthesized])
    expect(candidates[0]!.origin).toBe('DISCOVERED')
  })

  it('finalScore = planningConfidence × evidenceConfidence × provenanceWeight', () => {
    const match: WorkflowMatchEvidence = {
      workflowId: 'wf-1',
      descriptor: makeDescriptor('wf-1', 0.8),
      matchedConcepts: ['read'],
      unmatchedConcepts: [],
      rawMatchScore: 0.5,
    }
    const candidates = ranker.rank([match], [])
    const c = candidates[0]!
    expect(c.scores.finalScore).toBeCloseTo(c.scores.planningConfidence * c.scores.evidenceConfidence * c.scores.provenanceWeight, 5)
  })

  it('SYNTHESIZED provenanceWeight is 0.85', () => {
    const synth: CapabilityPlanEvidence = {
      graphPaths: ['a → b'],
      selectedCapabilities: ['skill-a'],
      missingCapabilities: [],
      synthesizedSteps: [{ skillId: 'skill-a', graphPath: 'a → b', rationale: 'r' }],
      coverageScore: 1.0,
      confidence: 1.0,
    }
    const candidates = ranker.rank([], [synth])
    expect(candidates[0]!.scores.provenanceWeight).toBe(0.85)
  })
})
