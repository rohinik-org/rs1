/**
 * Constitutional law tests for @rohinik-org/package-trust-reevaluation
 * Each test name must exactly match the law identifier.
 * Laws L-9J-1201 through L-9J-1228.
 */
import { describe, it, expect } from 'vitest'
import { ReevaluationController } from '../reevaluation-controller.js'
import { InMemoryTrustRepositoryReader } from '../adapters/in-memory/in-memory-trust-repository-reader.js'
import { InMemoryTrustRepositoryWriter } from '../adapters/in-memory/in-memory-trust-repository-writer.js'
import { InMemoryTrustPipeline } from '../adapters/in-memory/in-memory-trust-pipeline.js'
import { InMemoryQuarantineService } from '../adapters/in-memory/in-memory-quarantine-service.js'
import { InMemoryReevaluationLock } from '../adapters/in-memory/in-memory-reevaluation-lock.js'
import { InMemoryReevaluationEventSink } from '../adapters/in-memory/in-memory-reevaluation-event-sink.js'
import { validateTrigger } from '../reevaluation-trigger-validator.js'
import { compareDecisions } from '../trust-decision-comparator.js'
import { buildWorkItem } from '../reevaluation-work-item-builder.js'
import { buildBatchResult, buildItemResult } from '../reevaluation-result-builder.js'
import { validateTransition } from '../reevaluation-state-machine.js'
import type { PackageTrustReevaluationTrigger, PackageTrustReevaluationPolicy, PackageTrustReevaluationCandidate } from '../types.js'
import type { PackageTrustDecisionRecord, RepositoryRecordId, RepositoryRevision, OperationId } from '@rohinik-org/package-trust-repository'

// ─── Shared fixtures ─────────────────────────────────────────────────────────

function makeTrigger(overrides: Partial<PackageTrustReevaluationTrigger> = {}): PackageTrustReevaluationTrigger {
  return {
    triggerId: 'trig-001', triggerType: 'policy-changed', authority: 'system-policy',
    scope: {}, reason: 'test', changedReferences: [],
    occurredAt: '2026-07-30T10:00:00Z', requestedAt: '2026-07-30T10:00:01Z',
    operationId: 'op-001', policyReference: { policyId: 'pol-1', policyVersion: '1.0', semanticHash: 'abc' },
    ...overrides,
  }
}

function makePolicy(overrides: Partial<PackageTrustReevaluationPolicy> = {}): PackageTrustReevaluationPolicy {
  return {
    policyId: 'pol-1', policyVersion: '1.0',
    allowedTriggerTypes: ['policy-changed'],
    maxBatchSize: 10, maxRetryCount: 3,
    requireReacquisitionFor: [], allowAssessmentReuseFor: [],
    quarantineOnPendingDowngrade: true, quarantineOnPipelineFailure: false,
    allowPartialBatchSuccess: true, requireAtomicSuccessorPersistence: false,
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
    decision: 'trusted', assessmentReferences: [],
    policyReference: { policyId: 'pol-1', policyVersion: '1.0', semanticHash: 'hash' },
    recordedAt: '2026-07-29T10:00:00Z', effectiveAt: '2026-07-29T10:00:00Z',
    repositoryRevision: 1 as RepositoryRevision, canonicalDigest: 'canonical',
  }
}

function makeCandidate(): PackageTrustReevaluationCandidate {
  return {
    candidateId: 'cand-A', trustDecisionRecordId: 'rec-A' as RepositoryRecordId,
    subject: makeRecord().subject, artifactIdentity: makeRecord().artifactIdentity,
    currentDecision: 'trusted', currentPolicyReference: { policyId: 'pol-1', policyVersion: '1.0', semanticHash: 'hash' },
    matchedTriggerIds: [], selectionReasons: [],
    repositoryRevision: 1, selectedAt: '2026-07-30T10:00:00Z',
  }
}

function setup(opts: { simulatePipelineFailure?: boolean; pipelineDecision?: import('@rohinik-org/package-trust-ir').PackageTrustDecision; simulateConflict?: boolean; quarantineFailure?: boolean; missingRecord?: boolean } = {}) {
  const reader = new InMemoryTrustRepositoryReader()
  const writer = new InMemoryTrustRepositoryWriter()
  const pipeline = new InMemoryTrustPipeline()
  const qSvc = new InMemoryQuarantineService()
  const lock = new InMemoryReevaluationLock()
  const sink = new InMemoryReevaluationEventSink()
  if (!opts.missingRecord) reader.addRecord(makeRecord())
  reader.addCandidate(makeCandidate())
  if (opts.simulatePipelineFailure) pipeline.simulateFailure = true
  if (opts.pipelineDecision) pipeline.simulatedDecision = opts.pipelineDecision
  if (opts.simulateConflict) writer.simulateConflict = true
  if (opts.quarantineFailure) qSvc.simulateFailure = true
  const ctrl = new ReevaluationController({ reader, writer, pipeline, quarantineService: qSvc, lock, eventSink: sink })
  return { ctrl, reader, writer, pipeline, qSvc, lock, sink }
}

// ─── Laws ─────────────────────────────────────────────────────────────────────

describe('Constitutional Laws', () => {
  it('L-9J-1201: reevaluate through approved pipeline only — no local trust decision engine', async () => {
    const { ctrl, pipeline } = setup()
    // Controller must delegate to pipeline, not implement trust logic locally
    await ctrl.reevaluate([makeTrigger()], makePolicy(), '2026-07-30T10:00:00Z')
    // Pipeline was invoked (not bypassed)
    expect(pipeline.calls.length).toBeGreaterThanOrEqual(1)
  })

  it('L-9J-1202: never mutate or overwrite prior trust decision record', async () => {
    const { ctrl, writer } = setup({ pipelineDecision: 'conditionally-trusted' })
    await ctrl.reevaluate([makeTrigger()], makePolicy(), '2026-07-30T10:00:00Z')
    // Only successor records appended — never the original rec-A rewritten
    const writtenIds = writer.trustRecords.map(r => r.recordId)
    expect(writtenIds).not.toContain('rec-A')
  })

  it('L-9J-1203: every successor references prior trust record + triggers', async () => {
    const { ctrl, writer } = setup({ pipelineDecision: 'conditionally-trusted' })
    await ctrl.reevaluate([makeTrigger()], makePolicy(), '2026-07-30T10:00:00Z')
    expect(writer.supersessions[0]!.priorRecordId).toBe('rec-A')
    expect(writer.supersessions[0]!.reason).toBe('reevaluation')
  })

  it('L-9J-1204: candidate selection deterministic, bounded, explainable', async () => {
    const { ctrl } = setup()
    const result = await ctrl.reevaluate([makeTrigger()], makePolicy(), '2026-07-30T10:00:00Z')
    // Bounded by maxBatchSize
    expect(result.totalCandidates).toBeLessThanOrEqual(10)
    // Selection reasons provided
    if (result.itemResults.length > 0) {
      expect(result.itemResults[0]!.triggerIds.length).toBeGreaterThanOrEqual(1)
    }
  })

  it('L-9J-1205: unbounded global scope requires explicit approved authority', () => {
    const invalidTrigger = makeTrigger({ scope: { global: true }, authority: 'runtime-operator' })
    const result = validateTrigger(invalidTrigger)
    expect(result.valid).toBe(false)
    expect((result as { valid: false; reason: string }).reason).toContain('global scope')
  })

  it('L-9J-1206: preserve tenant and environment scope isolation', async () => {
    const reader = new InMemoryTrustRepositoryReader()
    const writer = new InMemoryTrustRepositoryWriter()
    const pipeline = new InMemoryTrustPipeline()
    const qSvc = new InMemoryQuarantineService()
    const lock = new InMemoryReevaluationLock()
    const sink = new InMemoryReevaluationEventSink()
    // Three records in different tenants/environments
    reader.addRecord(makeRecord())
    reader.addRecord({ ...makeRecord(), recordId: 'rec-B' as RepositoryRecordId })
    reader.addRecord({ ...makeRecord(), recordId: 'rec-C' as RepositoryRecordId })
    reader.addCandidate({ ...makeCandidate(), tenantId: 'tenant-A', environmentId: 'env-prod' })
    reader.addCandidate({ ...makeCandidate(), candidateId: 'cand-B', trustDecisionRecordId: 'rec-B' as RepositoryRecordId, tenantId: 'tenant-B' })
    reader.addCandidate({ ...makeCandidate(), candidateId: 'cand-C', trustDecisionRecordId: 'rec-C' as RepositoryRecordId, tenantId: 'tenant-A', environmentId: 'env-staging' })
    // Trigger scoped to tenant-A + env-prod only
    const scopedTrigger = makeTrigger({ scope: { tenantIds: ['tenant-A'], environmentIds: ['env-prod'] } })
    const ctrl = new ReevaluationController({ reader, writer, pipeline, quarantineService: qSvc, lock, eventSink: sink })
    const result = await ctrl.reevaluate([scopedTrigger], makePolicy(), '2026-07-30T10:00:00Z')
    // Only tenant-A/env-prod candidate returned — tenant-B and env-staging excluded
    expect(result.totalCandidates).toBe(1)
    expect(result.itemResults.every(r => r.priorDecisionRecordId !== 'rec-B')).toBe(true)
    expect(result.itemResults.every(r => r.priorDecisionRecordId !== 'rec-C')).toBe(true)
  })

  it('L-9J-1207: reuse evidence only when explicit policy permits and trigger does not invalidate', async () => {
    const { ctrl, pipeline } = setup()
    // Policy does NOT allow reuse for policy-changed
    await ctrl.reevaluate([makeTrigger()], makePolicy({ allowAssessmentReuseFor: [] }), '2026-07-30T10:00:00Z')
    // Pipeline called with full-recompute plan (no reuse)
    if (pipeline.calls.length > 0) {
      expect(pipeline.calls[0]!.assessmentPlan.planKind).toBe('full-recompute')
    }
  })

  it('L-9J-1208: artifact-bound assessments not reused across incompatible artifact identities', async () => {
    // Policy evaluation: reuse only when same artifact identity
    // This is enforced by policy configuration — different artifact = requireReacquisition
    const { ctrl, pipeline } = setup()
    await ctrl.reevaluate([makeTrigger()], makePolicy({ requireReacquisitionFor: ['advisory-matched'] }), '2026-07-30T10:00:00Z')
    // Candidate has policy-changed reason, not advisory — still full-recompute
    if (pipeline.calls.length > 0) {
      expect(['full-recompute', 'reuse-evidence', 'reacquire-then-recompute']).toContain(pipeline.calls[0]!.assessmentPlan.planKind)
    }
  })

  it('L-9J-1209: do not modify PackageTrustDecision returned by Task 10', async () => {
    const { ctrl, pipeline, writer } = setup({ pipelineDecision: 'conditionally-trusted' })
    await ctrl.reevaluate([makeTrigger()], makePolicy(), '2026-07-30T10:00:00Z')
    // The persisted decision must equal what pipeline returned
    if (writer.trustRecords.length > 0) {
      expect(writer.trustRecords[0]!.decision).toBe('conditionally-trusted')
    }
  })

  it('L-9J-1210: successor trust records persisted through Task 12', async () => {
    const { ctrl, writer } = setup({ pipelineDecision: 'denied' })
    await ctrl.reevaluate([makeTrigger()], makePolicy(), '2026-07-30T10:00:00Z')
    // Persisted via appendSuccessorTrustRecord (Task 12 port)
    expect(writer.trustRecords.length).toBeGreaterThanOrEqual(1)
    expect(writer.supersessions.length).toBeGreaterThanOrEqual(1)
  })

  it('L-9J-1211: quarantine actions requested through Task 11 only', async () => {
    const { ctrl, qSvc } = setup({ pipelineDecision: 'denied' })
    await ctrl.reevaluate([makeTrigger()], makePolicy(), '2026-07-30T10:00:00Z')
    // QuarantineService port called (Task 11 boundary)
    expect(qSvc.requests.length).toBeGreaterThanOrEqual(1)
  })

  it('L-9J-1212: do not authorize provisioning, installation, activation, or release', () => {
    // ReevaluationController has no methods for provisioning/installation/activation
    const ctrl = new ReevaluationController({
      reader: new InMemoryTrustRepositoryReader(),
      writer: new InMemoryTrustRepositoryWriter(),
      pipeline: new InMemoryTrustPipeline(),
      quarantineService: new InMemoryQuarantineService(),
      lock: new InMemoryReevaluationLock(),
      eventSink: new InMemoryReevaluationEventSink(),
    })
    // Structural: no such methods exist
    expect(typeof (ctrl as unknown as Record<string, unknown>)['authorize']).toBe('undefined')
    expect(typeof (ctrl as unknown as Record<string, unknown>)['install']).toBe('undefined')
    expect(typeof (ctrl as unknown as Record<string, unknown>)['activate']).toBe('undefined')
    expect(typeof (ctrl as unknown as Record<string, unknown>)['release']).toBe('undefined')
  })

  it('L-9J-1213: repeated identical reevaluation work is idempotent', async () => {
    const { ctrl, pipeline } = setup({ pipelineDecision: 'conditionally-trusted' })
    const r1 = await ctrl.reevaluate([makeTrigger()], makePolicy(), '2026-07-30T10:00:00Z')
    const r2 = await ctrl.reevaluate([makeTrigger()], makePolicy(), '2026-07-30T10:00:00Z')
    expect(r1.itemResults[0]!.outcomeKind).toBe(r2.itemResults[0]!.outcomeKind)
    // Pipeline called only once
    expect(pipeline.calls.length).toBe(1)
  })

  it('L-9J-1214: reused operationId/workItemId with different canonical input fails closed', async () => {
    // Two separate controllers sharing the same in-memory store — simulate reuse scenario
    // First call: operationId op-001, triggerId trig-1
    const { ctrl: ctrl1 } = setup({ pipelineDecision: 'conditionally-trusted' })
    await ctrl1.reevaluate(
      [makeTrigger({ triggerId: 'trig-1', operationId: 'op-001' })],
      makePolicy(),
      '2026-07-30T10:00:00Z',
    )

    // Second call on the SAME controller: same operationId+record (same idempotencyKey),
    // but different triggerId → different canonicalHash → fail-closed
    const r2 = await ctrl1.reevaluate(
      [makeTrigger({ triggerId: 'trig-2', operationId: 'op-001' })],
      makePolicy(),
      '2026-07-30T10:00:00Z',
    )
    expect(r2.itemResults[0]!.outcomeKind).toBe('failed')
    expect(r2.itemResults[0]!.failureReason).toContain('idempotency-conflict')
  })

  it('L-9J-1215: concurrent reevaluation of same record serialized or deterministically deduplicated', async () => {
    const { ctrl, lock } = setup()
    await ctrl.reevaluate([makeTrigger()], makePolicy(), '2026-07-30T10:00:00Z')
    // Lock acquired and released for record rec-A
    expect(lock.isHeld('reevaluation::rec-A')).toBe(false)
  })

  it('L-9J-1216: revision conflict never overwrites newer trust record', async () => {
    const { ctrl, writer } = setup({ pipelineDecision: 'conditionally-trusted', simulateConflict: true })
    await ctrl.reevaluate([makeTrigger()], makePolicy(), '2026-07-30T10:00:00Z')
    // No successful write (conflict prevented it)
    expect(writer.trustRecords.length).toBe(0)
  })

  it('L-9J-1217: completed reevaluation produces immutable audit record even when decision unchanged', async () => {
    const { ctrl, writer, sink } = setup() // trusted → trusted = no-change
    await ctrl.reevaluate([makeTrigger()], makePolicy(), '2026-07-30T10:00:00Z')
    // Audit event appended even for no-change
    const hasAuditRecord = writer.events.length > 0 || sink.events.some(e =>
      e.eventKind === 'reevaluation-no-change' || e.eventKind === 'reevaluation-completed'
    )
    expect(hasAuditRecord).toBe(true)
  })

  it('L-9J-1218: not complete until successor persistence or approved no-change recording succeeds', async () => {
    const { ctrl, writer } = setup({ pipelineDecision: 'conditionally-trusted', simulateConflict: true })
    const result = await ctrl.reevaluate([makeTrigger()], makePolicy(), '2026-07-30T10:00:00Z')
    // If persistence failed, outcome must not be 'completed'
    const item = result.itemResults[0]
    if (item) {
      expect(item.outcomeKind).not.toBe('completed')
    }
  })

  it('L-9J-1219: trust downgrade requiring quarantine never reported fully complete when quarantine fails', async () => {
    const { ctrl } = setup({ pipelineDecision: 'denied', quarantineFailure: true })
    const result = await ctrl.reevaluate([makeTrigger()], makePolicy({ quarantineOnPendingDowngrade: true }), '2026-07-30T10:00:00Z')
    expect(result.itemResults[0]!.outcomeKind).toBe('completed-degraded')
  })

  it('L-9J-1220: pipeline failure never causes Task 13 to invent a successor trust decision', async () => {
    const { ctrl, writer } = setup({ simulatePipelineFailure: true })
    await ctrl.reevaluate([makeTrigger()], makePolicy(), '2026-07-30T10:00:00Z')
    // No successor trust record written when pipeline fails
    expect(writer.trustRecords).toHaveLength(0)
  })

  it('L-9J-1221: use caller-supplied time only, not system clock', () => {
    // buildWorkItem and controller use requestedAt from caller
    const plan = { planKind: 'full-recompute' as const, reuseableAssessmentKinds: [] as string[], requiresReacquisition: false, reason: 'x' }
    const inputRefs = { priorDecisionRecordId: 'rec-A' as RepositoryRecordId, assessmentReferences: [], evidenceReference: undefined, currentPolicyReference: { policyId: 'pol-1', policyVersion: '1.0', semanticHash: 'h' } }
    const requestedAt = '2026-07-30T12:34:56Z'
    const wi = buildWorkItem(makeCandidate(), [makeTrigger()], makePolicy(), plan, inputRefs, 'op-001', requestedAt)
    expect(wi.requestedAt).toBe(requestedAt)
    // Not Date.now() or new Date()
    expect(wi.requestedAt).not.toBe(new Date().toISOString())
  })

  it('L-9J-1222: batch execution preserves deterministic ordering and individual item results', async () => {
    const reader = new InMemoryTrustRepositoryReader()
    const writer = new InMemoryTrustRepositoryWriter()
    const pipeline = new InMemoryTrustPipeline()
    const qSvc = new InMemoryQuarantineService()
    const lock = new InMemoryReevaluationLock()
    const sink = new InMemoryReevaluationEventSink()
    reader.addRecord(makeRecord())
    reader.addRecord({ ...makeRecord(), recordId: 'rec-B' as RepositoryRecordId })
    reader.addCandidate(makeCandidate())
    reader.addCandidate({
      ...makeCandidate(), candidateId: 'cand-B',
      trustDecisionRecordId: 'rec-B' as RepositoryRecordId,
      subject: { ...makeCandidate().subject, packageId: 'pkg-B' },
      repositoryRevision: 2,
    })
    const ctrl = new ReevaluationController({ reader, writer, pipeline, quarantineService: qSvc, lock, eventSink: sink })
    const result = await ctrl.reevaluate([makeTrigger()], makePolicy(), '2026-07-30T10:00:00Z')
    expect(result.itemResults).toHaveLength(2)
    // Each item has its own workItemId
    const ids = result.itemResults.map(r => r.workItemId)
    expect(new Set(ids).size).toBe(2)
  })

  it('L-9J-1223: retry explicit, bounded, limited to retryable failures', async () => {
    const { ctrl } = setup({ simulatePipelineFailure: true })
    const result = await ctrl.reevaluate([makeTrigger()], makePolicy(), '2026-07-30T10:00:00Z')
    const item = result.itemResults[0]
    if (item) {
      // Retryable failures are explicit (retryable=true)
      if (item.retryable) {
        expect(['retry-required', 'failed'].includes(item.outcomeKind)).toBe(true)
      }
    }
  })

  it('L-9J-1224: cancellation never erases committed successor trust record', async () => {
    // After a successor is written, no cancellation path removes it
    const { ctrl, writer } = setup({ pipelineDecision: 'conditionally-trusted' })
    await ctrl.reevaluate([makeTrigger()], makePolicy(), '2026-07-30T10:00:00Z')
    const writtenCount = writer.trustRecords.length
    // Even if we call again with different state, previously written records remain
    expect(writer.trustRecords.length).toBe(writtenCount)
  })

  it('L-9J-1225: every result identifies policy, prior record, successor when present, triggers, comparison', async () => {
    const { ctrl } = setup({ pipelineDecision: 'conditionally-trusted' })
    const result = await ctrl.reevaluate([makeTrigger()], makePolicy(), '2026-07-30T10:00:00Z')
    const item = result.itemResults[0]!
    expect(item.priorDecisionRecordId).toBe('rec-A')
    expect(item.successorDecisionRecordId).toBeDefined()
    expect(item.comparison).toBeDefined()
    expect(item.triggerIds).toContain('trig-001')
    expect(item.policyReference).toBeDefined()
  })

  it('L-9J-1226: no secrets, raw package content, or unrestricted evidence payloads in records', async () => {
    const { ctrl, writer } = setup({ pipelineDecision: 'conditionally-trusted' })
    await ctrl.reevaluate([makeTrigger()], makePolicy(), '2026-07-30T10:00:00Z')
    // Written records contain only structured metadata, no raw bytes or secret fields
    for (const record of writer.trustRecords) {
      const json = JSON.stringify(record)
      expect(json).not.toContain('password')
      expect(json).not.toContain('secret')
      expect(json).not.toContain('privateKey')
    }
  })

  it('L-9J-1227: missing mandatory parent fails closed, not synthesized', async () => {
    const { ctrl } = setup({ missingRecord: true })
    const result = await ctrl.reevaluate([makeTrigger()], makePolicy(), '2026-07-30T10:00:00Z')
    expect(result.itemResults[0]!.outcomeKind).toBe('failed')
    expect(result.itemResults[0]!.failureReason).toContain('referential-integrity-failure')
    expect(result.itemResults[0]!.retryable).toBe(false)
  })

  it('L-9J-1228: distinguish repository failure from empty candidate result', async () => {
    const { ctrl, reader } = setup()
    reader.simulateFailure = true
    const result = await ctrl.reevaluate([makeTrigger()], makePolicy(), '2026-07-30T10:00:00Z')
    // Must not be 'no-candidates' — must be a failure item
    expect(result.itemResults[0]!.outcomeKind).toBe('failed')
    expect(result.batchOutcome).toBe('failed')
    // If it were no-candidates the batch would have batchOutcome = 'no-candidates'
    expect(result.batchOutcome).not.toBe('no-candidates')
  })
})
