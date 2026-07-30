import { describe, it, expect } from 'vitest'
import { buildWorkItem } from '../reevaluation-work-item-builder.js'
import type {
  PackageTrustReevaluationCandidate,
  PackageTrustReevaluationPolicy,
  PackageTrustReevaluationTrigger,
  ReevaluationAssessmentPlan,
  ReevaluationInputReferences,
} from '../types.js'
import type { RepositoryRecordId } from '@rohinik-org/package-trust-repository'

function makeCandidate(): PackageTrustReevaluationCandidate {
  return {
    candidateId: 'cand-A',
    trustDecisionRecordId: 'rec-A' as RepositoryRecordId,
    subject: { subjectKind: 'rohinik-package', packageId: 'pkg-A', version: '1.0.0', sourceIdentity: { sourceKind: 'workspace', workspaceId: 'ws', artifactId: 'A' }, expectedIntegrity: { algorithm: 'sha256', encoding: 'hex', value: 'abc' } },
    artifactIdentity: { packageId: 'pkg-A', version: '1.0.0', artifactDigest: 'sha256:abc' },
    currentDecision: 'trusted',
    currentPolicyReference: { policyId: 'pol-1', policyVersion: '1.0', semanticHash: 'hash' },
    matchedTriggerIds: ['trig-001'],
    selectionReasons: [],
    repositoryRevision: 5,
    selectedAt: '2026-07-30T10:00:00Z',
  }
}

const plan: ReevaluationAssessmentPlan = {
  planKind: 'full-recompute',
  reuseableAssessmentKinds: [],
  requiresReacquisition: false,
  reason: 'full-recompute',
}

const inputRefs: ReevaluationInputReferences = {
  priorDecisionRecordId: 'rec-A' as RepositoryRecordId,
  assessmentReferences: [],
  evidenceReference: undefined,
  currentPolicyReference: { policyId: 'pol-1', policyVersion: '1.0', semanticHash: 'hash' },
}

const policy: PackageTrustReevaluationPolicy = {
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
}

const trigger: PackageTrustReevaluationTrigger = {
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

describe('ReevaluationWorkItemBuilder', () => {
  it('builds a work item with correct fields', () => {
    const wi = buildWorkItem(makeCandidate(), [trigger], policy, plan, inputRefs, 'op-001', '2026-07-30T10:00:00Z')
    expect(wi.workItemId).toContain('op-001')
    expect(wi.operationId).toBe('op-001')
    expect(wi.triggerIds).toContain('trig-001')
    expect(wi.assessmentPlan.planKind).toBe('full-recompute')
    expect(wi.expectedRepositoryRevision).toBe(5)
  })

  it('includes all trigger IDs', () => {
    const t2 = { ...trigger, triggerId: 'trig-002' }
    const wi = buildWorkItem(makeCandidate(), [trigger, t2], policy, plan, inputRefs, 'op-001', '2026-07-30T10:00:00Z')
    expect(wi.triggerIds).toHaveLength(2)
  })

  it('uses caller-supplied time (L-9J-1221)', () => {
    const requestedAt = '2026-07-30T12:00:00Z'
    const wi = buildWorkItem(makeCandidate(), [trigger], policy, plan, inputRefs, 'op-001', requestedAt)
    expect(wi.requestedAt).toBe(requestedAt)
  })
})
