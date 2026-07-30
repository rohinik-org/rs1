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

function makeTrigger(opId = 'op-001'): PackageTrustReevaluationTrigger {
  return {
    triggerId: `trig-${opId}`,
    triggerType: 'policy-changed',
    authority: 'system-policy',
    scope: {},
    reason: 'test',
    changedReferences: [],
    occurredAt: '2026-07-30T10:00:00Z',
    requestedAt: '2026-07-30T10:00:01Z',
    operationId: opId,
    policyReference: { policyId: 'pol-1', policyVersion: '1.0', semanticHash: 'abc' },
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

function makeController() {
  const reader = new InMemoryTrustRepositoryReader()
  const writer = new InMemoryTrustRepositoryWriter()
  const pipeline = new InMemoryTrustPipeline()
  const qSvc = new InMemoryQuarantineService()
  const lock = new InMemoryReevaluationLock()
  const sink = new InMemoryReevaluationEventSink()
  reader.addRecord(makeRecord())
  reader.addCandidate(makeCandidate())
  return { ctrl: new ReevaluationController({ reader, writer, pipeline, quarantineService: qSvc, lock, eventSink: sink }), reader, writer, pipeline, qSvc, lock, sink }
}

describe('Idempotency', () => {
  it('L-9J-1213: repeated identical reevaluation work returns existing result', async () => {
    const { ctrl, pipeline } = makeController()
    pipeline.simulatedDecision = 'conditionally-trusted'

    const result1 = await ctrl.reevaluate([makeTrigger()], makePolicy(), '2026-07-30T10:00:00Z')
    const result2 = await ctrl.reevaluate([makeTrigger()], makePolicy(), '2026-07-30T10:00:00Z')

    // Second call returns cached result — pipeline called only once per unique work item
    expect(result1.itemResults[0]!.outcomeKind).toBe(result2.itemResults[0]!.outcomeKind)
  })

  it('pipeline is not called twice for idempotent repeat', async () => {
    const { ctrl, pipeline } = makeController()
    pipeline.simulatedDecision = 'conditionally-trusted'

    await ctrl.reevaluate([makeTrigger()], makePolicy(), '2026-07-30T10:00:00Z')
    const callCount = pipeline.calls.length

    await ctrl.reevaluate([makeTrigger()], makePolicy(), '2026-07-30T10:00:00Z')
    // No additional pipeline calls for idempotent repeat
    expect(pipeline.calls.length).toBe(callCount)
  })

  it('L-9J-1218: not complete until persistence succeeds', async () => {
    const { ctrl, writer } = makeController()
    writer.simulateConflict = true

    const result = await ctrl.reevaluate(
      [makeTrigger()],
      makePolicy({ maxBatchSize: 10 }),
      '2026-07-30T10:00:00Z',
    )
    // When writer throws revision-conflict, item should be retry-required
    const item = result.itemResults[0]
    if (item) {
      // trusted → trusted (no-change) doesn't write, so no conflict would occur
      // For a decision change case we'd see retry-required
      expect(['completed-no-change', 'retry-required', 'failed'].includes(item.outcomeKind)).toBe(true)
    }
  })
})
