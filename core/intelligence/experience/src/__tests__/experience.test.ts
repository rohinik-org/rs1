import { describe, it, expect, vi } from 'vitest'
import {
  ExperienceEvent,
  type ExperienceRequest,
  type EvaluationRecord,
  type WorkingContextIR,
} from '@rohinik-org/experience-ir'
import {
  ExperienceCollector,
  ExperienceFingerprintBuilder,
  ExperienceAssembler,
  ExperienceRecorder,
  DuplicateExperienceError,
} from '../index.js'

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeContext(overrides?: Partial<WorkingContextIR>): WorkingContextIR {
  return Object.freeze({
    contextId: 'ctx-1',
    requestId: 'req-1',
    intent: Object.freeze({ rawInput: 'test intent', processedText: 'test intent', confidence: 0.9 }),
    installedCapabilities: Object.freeze([{ capabilityId: 'cap-1', version: '1.0.0' }]),
    knowledgeFragments: Object.freeze([]),
    memories: Object.freeze([]),
    assembledAt: new Date('2026-07-22T10:00:00Z'),
    contributors: Object.freeze([]),
    confidence: 0.9,
    tokenBudget: Object.freeze({ maxTokenBudget: 1000, maxMemories: 10, maxKnowledgeFragments: 10, maxCapabilities: 20 }),
    policy: Object.freeze({
      policyId: 'default',
      budget: Object.freeze({ maxTokenBudget: 1000, maxMemories: 10, maxKnowledgeFragments: 10, maxCapabilities: 20 }),
      includeCapabilities: true,
      includeExecutionHistory: false,
      memoryRecency: 'recent-first' as const,
    }),
    ...overrides,
  } as WorkingContextIR)
}

function makeEvaluationRecord(overrides?: Partial<EvaluationRecord>): EvaluationRecord {
  return Object.freeze({
    recordId: 'record-abc123',
    evaluationId: 'eval-1',
    requestId: 'req-1',
    decisionId: 'decision-1',
    executionId: 'exec-1',
    sessionId: 'session-1',
    policyId: 'default',
    policyVersion: '1.0.0',
    observedOutcome: Object.freeze({
      finalState: 'COMPLETED' as const,
      totalDurationMs: 1000,
      stepCount: 2,
      failedStepCount: 0,
      retryCount: 1,
    }),
    predictionComparison: Object.freeze({
      latencyErrorMs: 100,
      latencyErrorPct: 10,
      failurePredicted: false,
      failureObserved: false,
      failurePredictionCorrect: true,
      topCapabilityHit: true,
      predictionConfidence: 0.9,
    }),
    planningComparison: Object.freeze({
      planExecuted: true,
      planSucceeded: true,
      retriesOccurred: true,
      budgetRespected: true,
      decisionConfidence: 0.85,
      selectionMargin: 0.1,
      planningAlgorithmVersion: '1.0.0',
    }),
    executionComparison: Object.freeze({
      completedSteps: 2,
      failedSteps: 0,
      cancelledSteps: 0,
      totalRetries: 1,
      durationMs: 1000,
      stepSuccessRate: 1.0,
    }),
    scores: Object.freeze({
      overallScore: 0.92,
      predictionAccuracy: 1.0,
      planningAccuracy: 1.0,
      executionEfficiency: 1.0,
    }),
    provenance: Object.freeze({
      scorerVersion: '1.0.0',
      policyFingerprint: 'fingerprint-xyz',
      decisionId: 'decision-1',
      executionId: 'exec-1',
    }),
    telemetry: Object.freeze({ evaluationDurationMs: 5 }),
    explanation: Object.freeze({
      primaryReason: 'EXECUTION_SUCCESS' as const,
      notes: Object.freeze([]),
    }),
    producedAt: new Date('2026-07-22T10:00:01Z'),
    ...overrides,
  } as unknown as EvaluationRecord)
}

function makeExperienceRequest(overrides?: Partial<ExperienceRequest>): ExperienceRequest {
  return Object.freeze({
    experienceRequestId: 'exp-req-1',
    evaluation: makeEvaluationRecord(),
    context: makeContext(),
    requestedAt: new Date(),
    ...overrides,
  } as ExperienceRequest)
}

function makeMockEvents() {
  return { emit: vi.fn(), on: vi.fn(), off: vi.fn() }
}

function makeRecorder(opts?: { replayMode?: boolean }) {
  return new ExperienceRecorder(
    new ExperienceCollector(),
    new ExperienceFingerprintBuilder(),
    new ExperienceAssembler(),
    makeMockEvents(),
    opts,
  )
}

// ─── ExperienceEvent frozen const ────────────────────────────────────────────

describe('ExperienceEvent', () => {
  it('is frozen', () => {
    expect(Object.isFrozen(ExperienceEvent)).toBe(true)
  })
})

// ─── ExperienceCollector ──────────────────────────────────────────────────────

describe('ExperienceCollector', () => {
  const collector = new ExperienceCollector()

  it('copies core IDs from evaluation', () => {
    const req = makeExperienceRequest()
    const source = collector.collect(req, req.evaluation)
    expect(source.evaluationRecordId).toBe(req.evaluation.recordId)
    expect(source.sessionId).toBe(req.evaluation.sessionId)
    expect(source.executionId).toBe(req.evaluation.executionId)
    expect(source.decisionId).toBe(req.evaluation.decisionId)
  })

  it('copies comparison and score fields from evaluation', () => {
    const req = makeExperienceRequest()
    const source = collector.collect(req, req.evaluation)
    expect(source.observedOutcome).toEqual(req.evaluation.observedOutcome)
    expect(source.scores).toEqual(req.evaluation.scores)
    expect(source.explanation).toEqual(req.evaluation.explanation)
  })

  it('computes intentHash deterministically — same context = same hash', () => {
    const req = makeExperienceRequest()
    const s1 = collector.collect(req, req.evaluation)
    const s2 = collector.collect(req, req.evaluation)
    expect(s1.intentHash).toBe(s2.intentHash)
    expect(s1.intentHash).toHaveLength(64) // sha256 hex
  })

  it('computes capabilityHash deterministically', () => {
    const req = makeExperienceRequest()
    const s1 = collector.collect(req, req.evaluation)
    const s2 = collector.collect(req, req.evaluation)
    expect(s1.capabilityHash).toBe(s2.capabilityHash)
  })

  it('computes planHash deterministically', () => {
    const req = makeExperienceRequest()
    const s1 = collector.collect(req, req.evaluation)
    const s2 = collector.collect(req, req.evaluation)
    expect(s1.planHash).toBe(s2.planHash)
  })

  it('different intent = different intentHash', () => {
    const req1 = makeExperienceRequest({ context: makeContext({ intent: { rawInput: 'intent A', processedText: 'A', confidence: 0.9 } as never }) })
    const req2 = makeExperienceRequest({ context: makeContext({ intent: { rawInput: 'intent B', processedText: 'B', confidence: 0.9 } as never }) })
    const s1 = collector.collect(req1, req1.evaluation)
    const s2 = collector.collect(req2, req2.evaluation)
    expect(s1.intentHash).not.toBe(s2.intentHash)
  })

  it('returns frozen source', () => {
    const req = makeExperienceRequest()
    const source = collector.collect(req, req.evaluation)
    expect(Object.isFrozen(source)).toBe(true)
  })
})

// ─── ExperienceFingerprintBuilder ────────────────────────────────────────────

describe('ExperienceFingerprintBuilder', () => {
  const collector = new ExperienceCollector()
  const builder = new ExperienceFingerprintBuilder()

  it('produces deterministic experienceId (Law 55)', () => {
    const req = makeExperienceRequest()
    const source = collector.collect(req, req.evaluation)
    const f1 = builder.build(source, req.evaluation)
    const f2 = builder.build(source, req.evaluation)
    expect(f1.experienceId).toBe(f2.experienceId)
  })

  it('experienceId is a 64-char sha256 hex string', () => {
    const req = makeExperienceRequest()
    const source = collector.collect(req, req.evaluation)
    const fp = builder.build(source, req.evaluation)
    expect(fp.experienceId).toHaveLength(64)
    expect(fp.experienceId).toMatch(/^[0-9a-f]{64}$/)
  })

  it('different evidence produces different experienceId', () => {
    const req1 = makeExperienceRequest()
    const req2 = makeExperienceRequest({
      evaluation: makeEvaluationRecord({ recordId: 'different-record', sessionId: 'session-2', decisionId: 'decision-2' }),
      context: makeContext({ intent: { rawInput: 'different intent', processedText: 'different', confidence: 0.5 } as never }),
    })
    const s1 = collector.collect(req1, req1.evaluation)
    const s2 = collector.collect(req2, req2.evaluation)
    const f1 = builder.build(s1, req1.evaluation)
    const f2 = builder.build(s2, req2.evaluation)
    expect(f1.experienceId).not.toBe(f2.experienceId)
  })

  it('reuses evaluation policyFingerprint — does not recompute', () => {
    const req = makeExperienceRequest()
    const source = collector.collect(req, req.evaluation)
    const fp = builder.build(source, req.evaluation)
    expect(fp.evaluationFingerprint).toBe(req.evaluation.provenance.policyFingerprint)
  })

  it('fingerprint carries all three hash inputs', () => {
    const req = makeExperienceRequest()
    const source = collector.collect(req, req.evaluation)
    const fp = builder.build(source, req.evaluation)
    expect(fp.intentHash).toBe(source.intentHash)
    expect(fp.capabilityHash).toBe(source.capabilityHash)
    expect(fp.planHash).toBe(source.planHash)
  })

  it('returns frozen fingerprint', () => {
    const req = makeExperienceRequest()
    const source = collector.collect(req, req.evaluation)
    const fp = builder.build(source, req.evaluation)
    expect(Object.isFrozen(fp)).toBe(true)
  })
})

// ─── ExperienceAssembler ──────────────────────────────────────────────────────

describe('ExperienceAssembler', () => {
  const collector = new ExperienceCollector()
  const builder = new ExperienceFingerprintBuilder()
  const assembler = new ExperienceAssembler()

  function assemble(req = makeExperienceRequest()) {
    const source = collector.collect(req, req.evaluation)
    const fp = builder.build(source, req.evaluation)
    return assembler.assemble(req, source, fp, '1.0.0', 10)
  }

  it('SCHEMA_VERSION is a string', () => {
    expect(typeof ExperienceAssembler.SCHEMA_VERSION).toBe('string')
  })

  it('returns frozen ExperienceRecord (Laws 52 + 54)', () => {
    expect(Object.isFrozen(assemble())).toBe(true)
  })

  it('sets schemaVersion and captureVersion in metadata', () => {
    const record = assemble()
    expect(record.metadata.schemaVersion).toBe(ExperienceAssembler.SCHEMA_VERSION)
    expect(record.metadata.captureVersion).toBe('1.0.0')
  })

  it('experienceId comes from fingerprint', () => {
    const req = makeExperienceRequest()
    const source = collector.collect(req, req.evaluation)
    const fp = builder.build(source, req.evaluation)
    const record = assembler.assemble(req, source, fp, '1.0.0', 10)
    expect(record.experienceId).toBe(fp.experienceId)
  })

  it('evaluationRecordId points back to EvaluationRecord', () => {
    const record = assemble()
    expect(record.evaluationRecordId).toBe(makeEvaluationRecord().recordId)
  })
})

// ─── ExperienceRecorder ───────────────────────────────────────────────────────

describe('ExperienceRecorder', () => {
  it('VERSION is a string', () => {
    expect(typeof ExperienceRecorder.VERSION).toBe('string')
  })

  it('full pipeline returns ExperienceRecord', () => {
    const recorder = makeRecorder()
    const record = recorder.record(makeExperienceRequest())
    expect(record.experienceId).toBeDefined()
    expect(record.evaluationRecordId).toBeDefined()
    expect(record.scores).toBeDefined()
    expect(Object.isFrozen(record)).toBe(true)
  })

  it('same EvaluationRecord → same experienceId (Law 55)', () => {
    const evaluation = makeEvaluationRecord()
    const context = makeContext()
    const r1 = makeRecorder({ replayMode: true }).record(makeExperienceRequest({ evaluation, context }))
    const r2 = makeRecorder({ replayMode: true }).record(makeExperienceRequest({ evaluation, context }))
    expect(r1.experienceId).toBe(r2.experienceId)
  })

  it('producedAt excluded from experienceId — different timestamps, same id (Law 55)', () => {
    const evaluation = makeEvaluationRecord()
    const context = makeContext()
    const r1 = makeRecorder({ replayMode: true }).record(makeExperienceRequest({ evaluation, context, requestedAt: new Date('2026-01-01') }))
    const r2 = makeRecorder({ replayMode: true }).record(makeExperienceRequest({ evaluation, context, requestedAt: new Date('2026-06-01') }))
    expect(r1.experienceId).toBe(r2.experienceId)
  })

  it('telemetry captureDurationMs excluded from experienceId (Law 55)', () => {
    const evaluation = makeEvaluationRecord()
    const context = makeContext()
    const r1 = makeRecorder({ replayMode: true }).record(makeExperienceRequest({ evaluation, context }))
    const r2 = makeRecorder({ replayMode: true }).record(makeExperienceRequest({ evaluation, context }))
    expect(r1.experienceId).toBe(r2.experienceId)
    // telemetry can differ
    expect(typeof r1.telemetry.captureDurationMs).toBe('number')
  })

  it('throws DuplicateExperienceError on second record() for same evaluationRecordId (Law 52)', () => {
    const recorder = makeRecorder()
    const req = makeExperienceRequest()
    recorder.record(req)
    expect(() => recorder.record(req)).toThrow(DuplicateExperienceError)
  })

  it('DuplicateExperienceError message contains evaluationRecordId', () => {
    const recorder = makeRecorder()
    const req = makeExperienceRequest()
    recorder.record(req)
    expect(() => recorder.record(req)).toThrow(req.evaluation.recordId)
  })

  it('replayMode bypasses duplicate guard', () => {
    const recorder = makeRecorder({ replayMode: true })
    const req = makeExperienceRequest()
    expect(() => {
      recorder.record(req)
      recorder.record(req)
    }).not.toThrow()
  })

  it('synchronous — record() returns value without await', () => {
    const recorder = makeRecorder()
    const result = recorder.record(makeExperienceRequest())
    expect(result).toBeDefined()
    expect(result instanceof Promise).toBe(false)
  })

  it('emits EXPERIENCE_RECORD_READY with payload', () => {
    const events = makeMockEvents()
    const recorder = new ExperienceRecorder(
      new ExperienceCollector(),
      new ExperienceFingerprintBuilder(),
      new ExperienceAssembler(),
      events,
    )
    recorder.record(makeExperienceRequest())
    expect(events.emit).toHaveBeenCalledWith(
      ExperienceEvent.EXPERIENCE_RECORD_READY,
      expect.objectContaining({
        record: expect.objectContaining({ experienceId: expect.any(String) }),
        metadata: expect.objectContaining({ runtimeVersion: expect.any(String), hostId: expect.any(String) }),
      }),
    )
  })

  it('record is immutable (Laws 52 + 54)', () => {
    const recorder = makeRecorder()
    const record = recorder.record(makeExperienceRequest())
    expect(Object.isFrozen(record)).toBe(true)
    expect(Object.isFrozen(record.fingerprint)).toBe(true)
    expect(Object.isFrozen(record.metadata)).toBe(true)
    expect(Object.isFrozen(record.telemetry)).toBe(true)
  })

  it('different EvaluationRecord → different experienceId', () => {
    const r1 = makeRecorder({ replayMode: true }).record(
      makeExperienceRequest({ evaluation: makeEvaluationRecord({ recordId: 'rec-A', sessionId: 'session-a', decisionId: 'decision-a' }) })
    )
    const r2 = makeRecorder({ replayMode: true }).record(
      makeExperienceRequest({
        evaluation: makeEvaluationRecord({ recordId: 'rec-B', sessionId: 'session-b', decisionId: 'decision-b' }),
        context: makeContext({ intent: { rawInput: 'different', processedText: 'different', confidence: 0.5 } as never }),
      })
    )
    expect(r1.experienceId).not.toBe(r2.experienceId)
  })
})
