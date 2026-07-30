import { describe, it, expect } from 'vitest'
import { buildItemResult, buildBatchResult } from '../reevaluation-result-builder.js'
import type { PackageTrustReevaluationWorkItem } from '../types.js'
import type { RepositoryRecordId } from '@rohinik-org/package-trust-repository'

function makeWorkItem(): PackageTrustReevaluationWorkItem {
  return {
    workItemId: 'wi-001',
    operationId: 'op-001',
    candidate: {
      candidateId: 'cand-A',
      trustDecisionRecordId: 'rec-A' as RepositoryRecordId,
      subject: { subjectKind: 'rohinik-package', packageId: 'pkg-A', version: '1.0.0', sourceIdentity: { sourceKind: 'workspace', workspaceId: 'ws', artifactId: 'A' }, expectedIntegrity: { algorithm: 'sha256', encoding: 'hex', value: 'abc' } },
      artifactIdentity: { packageId: 'pkg-A', version: '1.0.0', artifactDigest: 'sha256:abc' },
      currentDecision: 'trusted',
      currentPolicyReference: { policyId: 'pol-1', policyVersion: '1.0', semanticHash: 'hash' },
      matchedTriggerIds: ['trig-001'],
      selectionReasons: [],
      repositoryRevision: 1,
      selectedAt: '2026-07-30T10:00:00Z',
    },
    triggerIds: ['trig-001'],
    reevaluationPolicy: {
      policyId: 'pol-1',
      policyVersion: '1.0',
      allowedTriggerTypes: ['policy-changed'],
      maxBatchSize: 10,
      maxRetryCount: 3,
      requireReacquisitionFor: [],
      allowAssessmentReuseFor: [],
      quarantineOnPendingDowngrade: false,
      quarantineOnPipelineFailure: false,
      allowPartialBatchSuccess: true,
      requireAtomicSuccessorPersistence: false,
      priorityRules: [],
    },
    assessmentPlan: { planKind: 'full-recompute', reuseableAssessmentKinds: [], requiresReacquisition: false, reason: 'full' },
    inputReferences: {
      priorDecisionRecordId: 'rec-A' as RepositoryRecordId,
      assessmentReferences: [],
      evidenceReference: undefined,
      currentPolicyReference: { policyId: 'pol-1', policyVersion: '1.0', semanticHash: 'h' },
    },
    requestedAt: '2026-07-30T10:00:00Z',
    expectedRepositoryRevision: 1,
  }
}

describe('ReevaluationResultBuilder', () => {
  it('builds completed item result', () => {
    const r = buildItemResult({
      workItem: makeWorkItem(),
      outcomeKind: 'completed',
      successorDecisionRecordId: undefined,
      comparison: undefined,
      failureReason: undefined,
      retryable: false,
      completedAt: '2026-07-30T10:00:00Z',
    })
    expect(r.outcomeKind).toBe('completed')
    expect(r.workItemId).toBe('wi-001')
    expect(r.triggerIds).toContain('trig-001')
    expect(r.retryable).toBe(false)
  })

  it('builds no-change item result', () => {
    const r = buildItemResult({
      workItem: makeWorkItem(),
      outcomeKind: 'completed-no-change',
      successorDecisionRecordId: undefined,
      comparison: undefined,
      failureReason: undefined,
      retryable: false,
      completedAt: '2026-07-30T10:00:00Z',
    })
    expect(r.outcomeKind).toBe('completed-no-change')
  })

  it('batch result: no-candidates when empty', () => {
    const r = buildBatchResult('op-001', ['trig-001'], [], '2026-07-30T10:00:00Z', '2026-07-30T10:01:00Z')
    expect(r.batchOutcome).toBe('no-candidates')
    expect(r.totalCandidates).toBe(0)
  })

  it('batch result: completed when all items completed', () => {
    const item = buildItemResult({
      workItem: makeWorkItem(),
      outcomeKind: 'completed',
      successorDecisionRecordId: undefined,
      comparison: undefined,
      failureReason: undefined,
      retryable: false,
      completedAt: '2026-07-30T10:00:00Z',
    })
    const r = buildBatchResult('op-001', ['trig-001'], [item], '2026-07-30T10:00:00Z', '2026-07-30T10:01:00Z')
    expect(r.batchOutcome).toBe('completed')
    expect(r.completedCount).toBe(1)
    expect(r.failedCount).toBe(0)
  })

  it('batch result: partial-success when some fail', () => {
    const ok = buildItemResult({ workItem: makeWorkItem(), outcomeKind: 'completed', successorDecisionRecordId: undefined, comparison: undefined, failureReason: undefined, retryable: false, completedAt: '2026-07-30T10:00:00Z' })
    const fail = buildItemResult({ workItem: { ...makeWorkItem(), workItemId: 'wi-002' }, outcomeKind: 'failed', successorDecisionRecordId: undefined, comparison: undefined, failureReason: undefined, retryable: false, completedAt: '2026-07-30T10:00:00Z' })
    const r = buildBatchResult('op-001', ['trig-001'], [ok, fail], '2026-07-30T10:00:00Z', '2026-07-30T10:01:00Z')
    expect(r.batchOutcome).toBe('partial-success')
  })

  it('batch result: failed when all fail', () => {
    const fail = buildItemResult({ workItem: makeWorkItem(), outcomeKind: 'failed', successorDecisionRecordId: undefined, comparison: undefined, failureReason: undefined, retryable: false, completedAt: '2026-07-30T10:00:00Z' })
    const r = buildBatchResult('op-001', ['trig-001'], [fail], '2026-07-30T10:00:00Z', '2026-07-30T10:01:00Z')
    expect(r.batchOutcome).toBe('failed')
  })
})
