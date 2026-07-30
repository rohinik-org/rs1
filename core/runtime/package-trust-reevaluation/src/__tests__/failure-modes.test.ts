import { describe, it, expect } from 'vitest'
import { ReevaluationController } from '../reevaluation-controller.js'
import { InMemoryTrustRepositoryReader } from '../adapters/in-memory/in-memory-trust-repository-reader.js'
import { InMemoryTrustRepositoryWriter } from '../adapters/in-memory/in-memory-trust-repository-writer.js'
import { InMemoryTrustPipeline } from '../adapters/in-memory/in-memory-trust-pipeline.js'
import { InMemoryQuarantineService } from '../adapters/in-memory/in-memory-quarantine-service.js'
import { InMemoryReevaluationLock } from '../adapters/in-memory/in-memory-reevaluation-lock.js'
import { InMemoryReevaluationEventSink } from '../adapters/in-memory/in-memory-reevaluation-event-sink.js'
import type { PackageTrustReevaluationTrigger, PackageTrustReevaluationPolicy, PackageTrustReevaluationCandidate } from '../types.js'
import type { PackageTrustDecisionRecord, RepositoryRecordId, RepositoryRevision, OperationId } from '@rohinik-org/package-trust-repository'

function makeTrigger(): PackageTrustReevaluationTrigger {
  return {
    triggerId: 'trig-001', triggerType: 'policy-changed', authority: 'system-policy',
    scope: {}, reason: 'test', changedReferences: [],
    occurredAt: '2026-07-30T10:00:00Z', requestedAt: '2026-07-30T10:00:01Z',
    operationId: 'op-001', policyReference: { policyId: 'pol-1', policyVersion: '1.0', semanticHash: 'abc' },
  }
}

function makePolicy(): PackageTrustReevaluationPolicy {
  return {
    policyId: 'pol-1', policyVersion: '1.0',
    allowedTriggerTypes: ['policy-changed'],
    maxBatchSize: 10, maxRetryCount: 3,
    requireReacquisitionFor: [], allowAssessmentReuseFor: [],
    quarantineOnPendingDowngrade: true, quarantineOnPipelineFailure: false,
    allowPartialBatchSuccess: true, requireAtomicSuccessorPersistence: false,
    priorityRules: [],
  }
}

function makeRecord(): PackageTrustDecisionRecord {
  return {
    recordId: 'rec-A' as RepositoryRecordId,
    operationId: 'op-000' as OperationId,
    subject: { subjectKind: 'rohinik-package', packageId: 'pkg-A', version: '1.0.0', sourceIdentity: { sourceKind: 'workspace', workspaceId: 'ws', artifactId: 'A' }, expectedIntegrity: { algorithm: 'sha256', encoding: 'hex', value: 'abc' } },
    artifactIdentity: { packageId: 'pkg-A', version: '1.0.0', artifactDigest: 'sha256:abc' },
    decision: 'trusted',
    assessmentReferences: [],
    policyReference: { policyId: 'pol-1', policyVersion: '1.0', semanticHash: 'hash' },
    recordedAt: '2026-07-29T10:00:00Z', effectiveAt: '2026-07-29T10:00:00Z',
    repositoryRevision: 1 as RepositoryRevision, canonicalDigest: 'canonical',
  }
}

function makeCandidate(): PackageTrustReevaluationCandidate {
  return {
    candidateId: 'cand-A',
    trustDecisionRecordId: 'rec-A' as RepositoryRecordId,
    subject: makeRecord().subject, artifactIdentity: makeRecord().artifactIdentity,
    currentDecision: 'trusted', currentPolicyReference: { policyId: 'pol-1', policyVersion: '1.0', semanticHash: 'hash' },
    matchedTriggerIds: [], selectionReasons: [],
    repositoryRevision: 1, selectedAt: '2026-07-30T10:00:00Z',
  }
}

function setup() {
  const reader = new InMemoryTrustRepositoryReader()
  const writer = new InMemoryTrustRepositoryWriter()
  const pipeline = new InMemoryTrustPipeline()
  const qSvc = new InMemoryQuarantineService()
  const lock = new InMemoryReevaluationLock()
  const sink = new InMemoryReevaluationEventSink()
  reader.addRecord(makeRecord())
  reader.addCandidate(makeCandidate())
  const ctrl = new ReevaluationController({ reader, writer, pipeline, quarantineService: qSvc, lock, eventSink: sink })
  return { ctrl, reader, writer, pipeline, qSvc, lock, sink }
}

describe('FailureModes', () => {
  it('pipeline failure produces failed item result (L-9J-1220)', async () => {
    const { ctrl, pipeline } = setup()
    pipeline.simulateFailure = true
    const result = await ctrl.reevaluate([makeTrigger()], makePolicy(), '2026-07-30T10:00:00Z')
    expect(['failed', 'retry-required'].includes(result.itemResults[0]!.outcomeKind)).toBe(true)
  })

  it('pipeline failure does not invent a decision (L-9J-1220)', async () => {
    const { ctrl, pipeline, writer } = setup()
    pipeline.simulateFailure = true
    await ctrl.reevaluate([makeTrigger()], makePolicy(), '2026-07-30T10:00:00Z')
    // No trust record should be appended since pipeline failed
    expect(writer.trustRecords).toHaveLength(0)
  })

  it('missing prior record fails closed (L-9J-1227)', async () => {
    const reader = new InMemoryTrustRepositoryReader()
    const writer = new InMemoryTrustRepositoryWriter()
    const pipeline = new InMemoryTrustPipeline()
    const qSvc = new InMemoryQuarantineService()
    const lock = new InMemoryReevaluationLock()
    const sink = new InMemoryReevaluationEventSink()
    // candidate added but NO record in reader
    reader.addCandidate(makeCandidate())
    const ctrl = new ReevaluationController({ reader, writer, pipeline, quarantineService: qSvc, lock, eventSink: sink })
    const result = await ctrl.reevaluate([makeTrigger()], makePolicy(), '2026-07-30T10:00:00Z')
    expect(result.itemResults[0]!.outcomeKind).toBe('failed')
    expect(result.itemResults[0]!.failureReason).toContain('referential-integrity-failure')
  })

  it('quarantine failure after downgrade = completed-degraded (L-9J-1219)', async () => {
    const { ctrl, pipeline, qSvc } = setup()
    pipeline.simulatedDecision = 'denied'
    qSvc.simulateFailure = true
    const result = await ctrl.reevaluate([makeTrigger()], makePolicy(), '2026-07-30T10:00:00Z')
    expect(result.itemResults[0]!.outcomeKind).toBe('completed-degraded')
  })

  it('repository query failure propagated as failure item (L-9J-1228)', async () => {
    const { ctrl, reader } = setup()
    reader.simulateFailure = true
    const result = await ctrl.reevaluate([makeTrigger()], makePolicy(), '2026-07-30T10:00:00Z')
    expect(result.itemResults[0]!.failureReason).toContain('repository-query-failure')
  })
})
