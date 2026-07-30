import { describe, it, expect, beforeEach } from 'vitest'
import { ReevaluationController } from '../reevaluation-controller.js'
import { InMemoryTrustRepositoryReader } from '../adapters/in-memory/in-memory-trust-repository-reader.js'
import { InMemoryTrustRepositoryWriter } from '../adapters/in-memory/in-memory-trust-repository-writer.js'
import { InMemoryTrustPipeline } from '../adapters/in-memory/in-memory-trust-pipeline.js'
import { InMemoryQuarantineService } from '../adapters/in-memory/in-memory-quarantine-service.js'
import { InMemoryReevaluationLock } from '../adapters/in-memory/in-memory-reevaluation-lock.js'
import { InMemoryReevaluationEventSink } from '../adapters/in-memory/in-memory-reevaluation-event-sink.js'
import type { PackageTrustReevaluationTrigger, PackageTrustReevaluationPolicy, PackageTrustReevaluationCandidate } from '../types.js'
import type { PackageTrustDecisionRecord, RepositoryRecordId, RepositoryRevision, OperationId } from '@rohinik-org/package-trust-repository'

function makeTrigger(overrides: Partial<PackageTrustReevaluationTrigger> = {}): PackageTrustReevaluationTrigger {
  return {
    triggerId: 'trig-001',
    triggerType: 'policy-changed',
    authority: 'system-policy',
    scope: {},
    reason: 'policy updated',
    changedReferences: [],
    occurredAt: '2026-07-30T10:00:00Z',
    requestedAt: '2026-07-30T10:00:01Z',
    operationId: 'op-001',
    policyReference: { policyId: 'pol-1', policyVersion: '1.0', semanticHash: 'abc' },
    ...overrides,
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
    allowAssessmentReuseFor: [],
    quarantineOnPendingDowngrade: false,
    quarantineOnPipelineFailure: false,
    allowPartialBatchSuccess: true,
    requireAtomicSuccessorPersistence: false,
    priorityRules: [],
    ...overrides,
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
    matchedTriggerIds: [],
    selectionReasons: [],
    repositoryRevision: 1,
    selectedAt: '2026-07-30T10:00:00Z',
  }
}

function makeController(reader: InMemoryTrustRepositoryReader, writer: InMemoryTrustRepositoryWriter, pipeline: InMemoryTrustPipeline, qSvc: InMemoryQuarantineService, lock: InMemoryReevaluationLock, sink: InMemoryReevaluationEventSink) {
  return new ReevaluationController({ reader, writer, pipeline, quarantineService: qSvc, lock, eventSink: sink })
}

describe('ReevaluationController', () => {
  let reader: InMemoryTrustRepositoryReader
  let writer: InMemoryTrustRepositoryWriter
  let pipeline: InMemoryTrustPipeline
  let qSvc: InMemoryQuarantineService
  let lock: InMemoryReevaluationLock
  let sink: InMemoryReevaluationEventSink

  beforeEach(() => {
    reader = new InMemoryTrustRepositoryReader()
    writer = new InMemoryTrustRepositoryWriter()
    pipeline = new InMemoryTrustPipeline()
    qSvc = new InMemoryQuarantineService()
    lock = new InMemoryReevaluationLock()
    sink = new InMemoryReevaluationEventSink()
    reader.addRecord(makeRecord())
    reader.addCandidate(makeCandidate())
  })

  it('returns no-candidates when repository returns empty page', async () => {
    const emptyReader = new InMemoryTrustRepositoryReader()
    // no candidates added
    const ctrl = makeController(emptyReader, writer, pipeline, qSvc, lock, sink)
    const result = await ctrl.reevaluate([makeTrigger()], makePolicy(), '2026-07-30T10:00:00Z')
    expect(result.batchOutcome).toBe('no-candidates')
    expect(result.totalCandidates).toBe(0)
  })

  it('processes candidate and produces completed result', async () => {
    const ctrl = makeController(reader, writer, pipeline, qSvc, lock, sink)
    const result = await ctrl.reevaluate([makeTrigger()], makePolicy(), '2026-07-30T10:00:00Z')
    expect(result.batchOutcome).toBe('completed-no-change') // trusted → trusted = no-semantic-change
    expect(result.itemResults).toHaveLength(1)
  })

  it('produces completed (with change) when decision changes', async () => {
    pipeline.simulatedDecision = 'conditionally-trusted'
    const ctrl = makeController(reader, writer, pipeline, qSvc, lock, sink)
    const result = await ctrl.reevaluate([makeTrigger()], makePolicy(), '2026-07-30T10:00:00Z')
    expect(result.batchOutcome).toBe('completed')
    expect(result.itemResults[0]!.outcomeKind).toBe('completed')
    expect(result.itemResults[0]!.successorDecisionRecordId).toBeDefined()
  })

  it('appends successor trust record on decision change', async () => {
    pipeline.simulatedDecision = 'conditionally-trusted'
    const ctrl = makeController(reader, writer, pipeline, qSvc, lock, sink)
    await ctrl.reevaluate([makeTrigger()], makePolicy(), '2026-07-30T10:00:00Z')
    expect(writer.trustRecords).toHaveLength(1)
    expect(writer.trustRecords[0]!.decision).toBe('conditionally-trusted')
  })

  it('records supersession on decision change (L-9J-1202, L-9J-1203)', async () => {
    pipeline.simulatedDecision = 'conditionally-trusted'
    const ctrl = makeController(reader, writer, pipeline, qSvc, lock, sink)
    await ctrl.reevaluate([makeTrigger()], makePolicy(), '2026-07-30T10:00:00Z')
    expect(writer.supersessions).toHaveLength(1)
    expect(writer.supersessions[0]!.priorRecordId).toBe('rec-A')
    expect(writer.supersessions[0]!.reason).toBe('reevaluation')
  })

  it('emits reevaluation-started event', async () => {
    const ctrl = makeController(reader, writer, pipeline, qSvc, lock, sink)
    await ctrl.reevaluate([makeTrigger()], makePolicy(), '2026-07-30T10:00:00Z')
    expect(sink.events.some(e => e.eventKind === 'reevaluation-started')).toBe(true)
  })

  it('emits completion event', async () => {
    const ctrl = makeController(reader, writer, pipeline, qSvc, lock, sink)
    await ctrl.reevaluate([makeTrigger()], makePolicy(), '2026-07-30T10:00:00Z')
    expect(sink.events.some(e => e.eventKind === 'reevaluation-no-change' || e.eventKind === 'reevaluation-completed')).toBe(true)
  })

  it('returns invalid-trigger result for invalid trigger without repo calls', async () => {
    const invalidTrigger = makeTrigger({ triggerId: '' })
    const ctrl = makeController(reader, writer, pipeline, qSvc, lock, sink)
    const result = await ctrl.reevaluate([invalidTrigger], makePolicy(), '2026-07-30T10:00:00Z')
    // No item results — batch built with empty items
    expect(result.totalCandidates).toBe(0)
    // Pipeline should not have been called
    expect(pipeline.calls).toHaveLength(0)
  })

  it('triggers quarantine when decision downgrade to denied (L-9J-1211)', async () => {
    pipeline.simulatedDecision = 'denied'
    const ctrl = makeController(reader, writer, pipeline, qSvc, lock, sink)
    await ctrl.reevaluate([makeTrigger()], makePolicy({ quarantineOnPendingDowngrade: true }), '2026-07-30T10:00:00Z')
    expect(qSvc.requests).toHaveLength(1)
  })

  it('handles repository query failure as failure, not no-candidates (L-9J-1228)', async () => {
    reader.simulateFailure = true
    const ctrl = makeController(reader, writer, pipeline, qSvc, lock, sink)
    const result = await ctrl.reevaluate([makeTrigger()], makePolicy(), '2026-07-30T10:00:00Z')
    expect(result.itemResults[0]!.outcomeKind).toBe('failed')
    expect(result.itemResults[0]!.failureReason).toContain('repository-query-failure')
  })

  it('batches multiple candidates', async () => {
    const cand2: PackageTrustReevaluationCandidate = {
      ...makeCandidate(),
      candidateId: 'cand-B',
      trustDecisionRecordId: 'rec-B' as RepositoryRecordId,
      subject: { ...makeCandidate().subject, packageId: 'pkg-B' },
    }
    const rec2 = { ...makeRecord(), recordId: 'rec-B' as RepositoryRecordId }
    reader.addCandidate(cand2)
    reader.addRecord(rec2)
    const ctrl = makeController(reader, writer, pipeline, qSvc, lock, sink)
    const result = await ctrl.reevaluate([makeTrigger()], makePolicy(), '2026-07-30T10:00:00Z')
    expect(result.itemResults).toHaveLength(2)
  })
})
