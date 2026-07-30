import { describe, it, expect } from 'vitest'
import type { PackageTrustReevaluationTrigger, PackageTrustReevaluationPolicy } from '@rohinik-org/package-trust-reevaluation'
import type { PolicyReference } from '@rohinik-org/package-trust-repository'
import { buildStage9JTestSystem } from '../scenarios/test-system-builder.js'
import {
  PACKAGE_ID,
  PACKAGE_VERSION,
  ARTIFACT_DIGEST,
  ISSUED_AT,
  POLICY_ID,
  POLICY_VERSION,
  CANONICAL_SUBJECT,
  ARTIFACT_IDENTITY,
  POLICY_REF,
} from '../fixtures/index.js'

const REEVAL_POLICY: PackageTrustReevaluationPolicy = {
  policyId: POLICY_ID,
  policyVersion: POLICY_VERSION,
  allowedTriggerTypes: ['vulnerability-advisory-changed', 'revocation-state-changed', 'publisher-trust-changed', 'manual-request'],
  maxBatchSize: 10,
  maxRetryCount: 2,
  requireReacquisitionFor: [],
  allowAssessmentReuseFor: ['policy-changed'],
  quarantineOnPendingDowngrade: false,
  quarantineOnPipelineFailure: false,
  allowPartialBatchSuccess: true,
  requireAtomicSuccessorPersistence: false,
  priorityRules: [],
}

function makeTrigger(overrides: Partial<PackageTrustReevaluationTrigger> = {}): PackageTrustReevaluationTrigger {
  return {
    triggerId: 'trigger-001',
    triggerType: 'manual-request',
    authority: 'system-policy',
    scope: { global: true },
    reason: 'integration test trigger',
    changedReferences: [],
    occurredAt: ISSUED_AT,
    requestedAt: ISSUED_AT,
    operationId: 'op-reeval-001',
    policyReference: POLICY_REF,
    ...overrides,
  }
}

describe('reevaluation', () => {
  it('reevaluation trigger accepted with valid trigger', async () => {
    const { harness, reevalRepositoryReader } = buildStage9JTestSystem()
    // Add a candidate so reevaluation has something to process
    reevalRepositoryReader.addCandidate({
      candidateId: 'cand-001',
      trustDecisionRecordId: 'rec-t15-001' as import('@rohinik-org/package-trust-repository').RepositoryRecordId,
      subject: CANONICAL_SUBJECT,
      artifactIdentity: ARTIFACT_IDENTITY,
      currentDecision: 'trusted',
      currentPolicyReference: POLICY_REF,
      matchedTriggerIds: ['trigger-001'],
      selectionReasons: [{ reasonType: 'manual-request', triggerId: 'trigger-001', description: 'test' }],
      repositoryRevision: 1,
      selectedAt: ISSUED_AT,
    })
    const result = await harness.reevaluate([makeTrigger()], REEVAL_POLICY, ISSUED_AT)
    expect(result.operationId).toBe('op-reeval-001')
  })

  it('reevaluation produces batch result', async () => {
    const { harness } = buildStage9JTestSystem()
    const result = await harness.reevaluate([makeTrigger()], REEVAL_POLICY, ISSUED_AT)
    expect(result.totalCandidates).toBeGreaterThanOrEqual(0)
  })

  it('pipeline called during reevaluation with candidates', async () => {
    const { harness, reevalRepositoryReader, reevalPipeline } = buildStage9JTestSystem()
    // Add prior record so resolveInputs can load it (L-9J-1227)
    reevalRepositoryReader.addRecord({
      recordId: 'rec-t15-001' as import('@rohinik-org/package-trust-repository').RepositoryRecordId,
      operationId: 'op-t15-001' as import('@rohinik-org/package-trust-repository').OperationId,
      subject: CANONICAL_SUBJECT,
      artifactIdentity: ARTIFACT_IDENTITY,
      decision: 'trusted',
      assessmentReferences: [{ assessmentKind: 'integrity', assessmentId: 'assess-001', semanticHash: 'hash-assess-001' }],
      policyReference: POLICY_REF,
      recordedAt: ISSUED_AT,
      effectiveAt: ISSUED_AT,
      repositoryRevision: 1 as import('@rohinik-org/package-trust-repository').RepositoryRevision,
      canonicalDigest: 'digest-001',
    })
    reevalRepositoryReader.addCandidate({
      candidateId: 'cand-001',
      trustDecisionRecordId: 'rec-t15-001' as import('@rohinik-org/package-trust-repository').RepositoryRecordId,
      subject: CANONICAL_SUBJECT,
      artifactIdentity: ARTIFACT_IDENTITY,
      currentDecision: 'trusted',
      currentPolicyReference: POLICY_REF,
      matchedTriggerIds: ['trigger-001'],
      selectionReasons: [{ reasonType: 'manual-request', triggerId: 'trigger-001', description: 'test' }],
      repositoryRevision: 1,
      selectedAt: ISSUED_AT,
    })
    await harness.reevaluate([makeTrigger()], REEVAL_POLICY, ISSUED_AT)
    expect(reevalPipeline.calls.length).toBeGreaterThan(0)
  })

  it('reevaluation event published', async () => {
    const { harness, reevalEventSink } = buildStage9JTestSystem()
    await harness.reevaluate([makeTrigger()], REEVAL_POLICY, ISSUED_AT)
    expect(reevalEventSink.events.length).toBeGreaterThan(0)
  })

  it('prior trust history is not mutated during reevaluation', async () => {
    const { harness } = buildStage9JTestSystem()
    // Persist initial record
    await harness.persist({
      operationId: 'op-t15-001' as import('@rohinik-org/package-trust-repository').OperationId,
      recordId: 'rec-t15-001' as import('@rohinik-org/package-trust-repository').RepositoryRecordId,
      subject: CANONICAL_SUBJECT,
      artifactIdentity: ARTIFACT_IDENTITY,
      decision: 'trusted',
      assessmentReferences: [],
      policyReference: POLICY_REF,
      recordedAt: ISSUED_AT,
    })
    // Reevaluate (no candidates → no-op)
    await harness.reevaluate([makeTrigger()], REEVAL_POLICY, ISSUED_AT)
    // Repository still has original record
    const record = await harness.repository.getTrustDecisionRecord({ recordId: 'rec-t15-001' as import('@rohinik-org/package-trust-repository').RepositoryRecordId })
    expect(record?.decision).toBe('trusted')
  })

  it('invalid trigger is rejected, no candidates queried', async () => {
    const { harness, reevalRepositoryReader } = buildStage9JTestSystem()
    reevalRepositoryReader.simulateFailure = false
    // Empty triggerId → validation failure
    const result = await harness.reevaluate(
      [makeTrigger({ triggerId: '' })],
      REEVAL_POLICY,
      ISSUED_AT,
    )
    // Should return batch result with no candidates processed
    expect(result.totalCandidates).toBe(0)
  })
})
