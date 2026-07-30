import { describe, it, expect } from 'vitest'
import { evaluateReevaluationPolicy } from '../reevaluation-policy-evaluator.js'
import type { PackageTrustReevaluationCandidate, PackageTrustReevaluationPolicy, PackageTrustReevaluationTrigger } from '../types.js'
import type { RepositoryRecordId } from '@rohinik-org/package-trust-repository'

function makeCandidate(reasonTypes: string[] = ['policy-changed']): PackageTrustReevaluationCandidate {
  return {
    candidateId: 'cand-A',
    trustDecisionRecordId: 'rec-A' as RepositoryRecordId,
    subject: { subjectKind: 'rohinik-package', packageId: 'pkg-A', version: '1.0.0', sourceIdentity: { sourceKind: 'workspace', workspaceId: 'ws', artifactId: 'A' }, expectedIntegrity: { algorithm: 'sha256', encoding: 'hex', value: 'abc' } },
    artifactIdentity: { packageId: 'pkg-A', version: '1.0.0', artifactDigest: 'sha256:abc' },
    currentDecision: 'trusted',
    currentPolicyReference: { policyId: 'pol-1', policyVersion: '1.0', semanticHash: 'hash' },
    matchedTriggerIds: ['trig-001'],
    selectionReasons: reasonTypes.map(r => ({ reasonType: r as import('../types.js').ReevaluationReasonType, triggerId: 'trig-001', description: r })),
    repositoryRevision: 1,
    selectedAt: '2026-07-30T10:00:00Z',
  }
}

function makePolicy(overrides: Partial<PackageTrustReevaluationPolicy> = {}): PackageTrustReevaluationPolicy {
  return {
    policyId: 'pol-1',
    policyVersion: '1.0',
    allowedTriggerTypes: ['policy-changed'],
    maxBatchSize: 10,
    maxRetryCount: 3,
    requireReacquisitionFor: [],
    allowAssessmentReuseFor: ['scheduled-refresh'],
    quarantineOnPendingDowngrade: true,
    quarantineOnPipelineFailure: false,
    allowPartialBatchSuccess: true,
    requireAtomicSuccessorPersistence: false,
    priorityRules: [],
    ...overrides,
  }
}

function makeTrigger(): PackageTrustReevaluationTrigger {
  return {
    triggerId: 'trig-001',
    triggerType: 'policy-changed',
    authority: 'system-policy',
    scope: {},
    reason: 'test',
    changedReferences: [],
    occurredAt: '2026-07-30T10:00:00Z',
    requestedAt: '2026-07-30T10:00:00Z',
    operationId: 'op-001',
    policyReference: { policyId: 'pol-1', policyVersion: '1.0', semanticHash: 'x' },
  }
}

describe('ReevaluationPolicyEvaluator', () => {
  it('returns full-recompute when no reuse configured', () => {
    const result = evaluateReevaluationPolicy(makeCandidate(), makeTrigger(), makePolicy())
    expect(result.assessmentPlan.planKind).toBe('full-recompute')
  })

  it('returns reuse-evidence when policy allows reuse for reason', () => {
    const result = evaluateReevaluationPolicy(
      makeCandidate(['scheduled-refresh']),
      makeTrigger(),
      makePolicy(),
    )
    expect(result.assessmentPlan.planKind).toBe('reuse-evidence')
  })

  it('returns reacquire-then-recompute when policy requires reacquisition', () => {
    const result = evaluateReevaluationPolicy(
      makeCandidate(['advisory-matched']),
      makeTrigger(),
      makePolicy({ requireReacquisitionFor: ['advisory-matched'] }),
    )
    expect(result.assessmentPlan.planKind).toBe('reacquire-then-recompute')
    expect(result.assessmentPlan.requiresReacquisition).toBe(true)
  })

  it('quarantineOnFailure reflects policy', () => {
    const result = evaluateReevaluationPolicy(makeCandidate(), makeTrigger(), makePolicy({ quarantineOnPipelineFailure: true }))
    expect(result.quarantineOnFailure).toBe(true)
  })

  it('quarantineOnDowngrade reflects policy', () => {
    const result = evaluateReevaluationPolicy(makeCandidate(), makeTrigger(), makePolicy({ quarantineOnPendingDowngrade: false }))
    expect(result.quarantineOnDowngrade).toBe(false)
  })

  it('reacquisition overrides reuse', () => {
    // If a reason requires reacquisition, even if also in allowReuse, reacquisition wins
    const result = evaluateReevaluationPolicy(
      makeCandidate(['advisory-matched']),
      makeTrigger(),
      makePolicy({
        requireReacquisitionFor: ['advisory-matched'],
        allowAssessmentReuseFor: ['advisory-matched'],
      }),
    )
    expect(result.assessmentPlan.planKind).toBe('reacquire-then-recompute')
  })
})
