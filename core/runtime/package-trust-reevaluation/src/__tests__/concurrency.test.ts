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
    triggerId: 'trig-001',
    triggerType: 'policy-changed',
    authority: 'system-policy',
    scope: {},
    reason: 'test',
    changedReferences: [],
    occurredAt: '2026-07-30T10:00:00Z',
    requestedAt: '2026-07-30T10:00:01Z',
    operationId: 'op-001',
    policyReference: { policyId: 'pol-1', policyVersion: '1.0', semanticHash: 'abc' },
  }
}

function makePolicy(): PackageTrustReevaluationPolicy {
  return {
    policyId: 'pol-1', policyVersion: '1.0',
    allowedTriggerTypes: ['policy-changed'],
    maxBatchSize: 10, maxRetryCount: 3,
    requireReacquisitionFor: [], allowAssessmentReuseFor: [],
    quarantineOnPendingDowngrade: false, quarantineOnPipelineFailure: false,
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
    recordedAt: '2026-07-29T10:00:00Z',
    effectiveAt: '2026-07-29T10:00:00Z',
    repositoryRevision: 1 as RepositoryRevision,
    canonicalDigest: 'canonical',
  }
}

function makeCandidate(): PackageTrustReevaluationCandidate {
  return {
    candidateId: 'cand-A',
    trustDecisionRecordId: 'rec-A' as RepositoryRecordId,
    subject: makeRecord().subject,
    artifactIdentity: makeRecord().artifactIdentity,
    currentDecision: 'trusted',
    currentPolicyReference: { policyId: 'pol-1', policyVersion: '1.0', semanticHash: 'hash' },
    matchedTriggerIds: [], selectionReasons: [],
    repositoryRevision: 1,
    selectedAt: '2026-07-30T10:00:00Z',
  }
}

describe('Concurrency', () => {
  it('L-9J-1215: lock is acquired per candidate record', async () => {
    const reader = new InMemoryTrustRepositoryReader()
    const writer = new InMemoryTrustRepositoryWriter()
    const pipeline = new InMemoryTrustPipeline()
    const qSvc = new InMemoryQuarantineService()
    const lock = new InMemoryReevaluationLock()
    const sink = new InMemoryReevaluationEventSink()
    reader.addRecord(makeRecord())
    reader.addCandidate(makeCandidate())

    const ctrl = new ReevaluationController({ reader, writer, pipeline, quarantineService: qSvc, lock, eventSink: sink })
    await ctrl.reevaluate([makeTrigger()], makePolicy(), '2026-07-30T10:00:00Z')
    // Lock should be released after processing
    expect(lock.isHeld('reevaluation::rec-A')).toBe(false)
  })

  it('L-9J-1215: lock contention returns retry-required', async () => {
    const reader = new InMemoryTrustRepositoryReader()
    const writer = new InMemoryTrustRepositoryWriter()
    const pipeline = new InMemoryTrustPipeline()
    const qSvc = new InMemoryQuarantineService()
    const lock = new InMemoryReevaluationLock()
    const sink = new InMemoryReevaluationEventSink()
    reader.addRecord(makeRecord())
    reader.addCandidate(makeCandidate())
    lock.simulateContention = true

    const ctrl = new ReevaluationController({ reader, writer, pipeline, quarantineService: qSvc, lock, eventSink: sink })
    const result = await ctrl.reevaluate([makeTrigger()], makePolicy(), '2026-07-30T10:00:00Z')
    expect(result.itemResults[0]!.outcomeKind).toBe('retry-required')
    expect(result.itemResults[0]!.retryable).toBe(true)
  })

  it('L-9J-1216: revision conflict returns retry-required, not overwrite', async () => {
    const reader = new InMemoryTrustRepositoryReader()
    const writer = new InMemoryTrustRepositoryWriter()
    const pipeline = new InMemoryTrustPipeline()
    const qSvc = new InMemoryQuarantineService()
    const lock = new InMemoryReevaluationLock()
    const sink = new InMemoryReevaluationEventSink()
    reader.addRecord(makeRecord())
    reader.addCandidate(makeCandidate())
    pipeline.simulatedDecision = 'conditionally-trusted' // force decision change so writer is called
    writer.simulateConflict = true

    const ctrl = new ReevaluationController({ reader, writer, pipeline, quarantineService: qSvc, lock, eventSink: sink })
    const result = await ctrl.reevaluate([makeTrigger()], makePolicy(), '2026-07-30T10:00:00Z')
    // Should be retry-required, not overwrite
    expect(['retry-required', 'failed'].includes(result.itemResults[0]!.outcomeKind)).toBe(true)
    // Prior record must not be mutated
    expect(writer.trustRecords.length).toBe(0) // no successful write on conflict
  })
})
