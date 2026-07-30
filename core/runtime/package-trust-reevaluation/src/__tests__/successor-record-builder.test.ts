import { describe, it, expect } from 'vitest'
import { buildSuccessorCommands } from '../successor-record-builder.js'
import type { PackageTrustReevaluationWorkItem, PackageTrustPipelineResult } from '../types.js'
import type { RepositoryRecordId, OperationId } from '@rohinik-org/package-trust-repository'

function makeWorkItem(): PackageTrustReevaluationWorkItem {
  return {
    workItemId: 'wi-op-001-rec-A',
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
      repositoryRevision: 3,
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
    assessmentPlan: { planKind: 'full-recompute', reuseableAssessmentKinds: [], requiresReacquisition: false, reason: 'full-recompute' },
    inputReferences: {
      priorDecisionRecordId: 'rec-A' as RepositoryRecordId,
      assessmentReferences: [],
      evidenceReference: undefined,
      currentPolicyReference: { policyId: 'pol-1', policyVersion: '1.0', semanticHash: 'hash' },
    },
    requestedAt: '2026-07-30T10:00:00Z',
    expectedRepositoryRevision: 3,
  }
}

const pipelineResult: PackageTrustPipelineResult = {
  workItemId: 'wi-op-001-rec-A',
  decision: 'conditionally-trusted',
  assessmentReferences: [{ assessmentKind: 'source', assessmentId: 'a1', semanticHash: 'h1' }],
  policyReference: { policyId: 'pol-2', policyVersion: '2.0', semanticHash: 'h2' },
  producedAt: '2026-07-30T10:00:00Z',
}

describe('SuccessorRecordBuilder', () => {
  it('builds trust command with correct decision', () => {
    const { trustCommand } = buildSuccessorCommands(
      makeWorkItem(), pipelineResult, 'rec-A-successor-op-001' as RepositoryRecordId, '2026-07-30T10:00:00Z'
    )
    expect(trustCommand.decision).toBe('conditionally-trusted')
    expect(trustCommand.recordId).toBe('rec-A-successor-op-001')
  })

  it('builds supersession command referencing prior record (L-9J-1203)', () => {
    const { supersessionCommand } = buildSuccessorCommands(
      makeWorkItem(), pipelineResult, 'rec-A-successor-op-001' as RepositoryRecordId, '2026-07-30T10:00:00Z'
    )
    expect(supersessionCommand.priorRecordId).toBe('rec-A')
    expect(supersessionCommand.successorRecordId).toBe('rec-A-successor-op-001')
    expect(supersessionCommand.reason).toBe('reevaluation')
  })

  it('sets expectedRevision from work item', () => {
    const { trustCommand } = buildSuccessorCommands(
      makeWorkItem(), pipelineResult, 'rec-A-successor' as RepositoryRecordId, '2026-07-30T10:00:00Z'
    )
    expect(trustCommand.expectedRevision).toBe(3)
  })

  it('uses caller-supplied recordedAt (L-9J-1221)', () => {
    const recordedAt = '2026-07-30T15:00:00Z'
    const { trustCommand } = buildSuccessorCommands(
      makeWorkItem(), pipelineResult, 'rec-A-s' as RepositoryRecordId, recordedAt
    )
    expect(trustCommand.recordedAt).toBe(recordedAt)
  })
})
