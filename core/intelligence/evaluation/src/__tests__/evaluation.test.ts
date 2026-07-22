import { describe, it, expect, vi } from 'vitest'
import {
  EvaluationReason,
  EvaluationEvent,
  DEFAULT_EVALUATION_POLICY,
  type EvaluationRequest,
  type EvaluationPolicyIR,
  type ExecutionResult,
  type ExecutionSession,
  type PredictionBundle,
  type PlanningDecision,
  type WorkingContextIR,
  type ObservedOutcome,
  type PredictionComparison,
  type PlanningComparison,
  type ExecutionComparison,
  type EvaluationScores,
} from '@rohinik-org/evaluation-ir'
import {
  OutcomeCollector,
  PredictionComparator,
  PlanningComparator,
  ExecutionComparator,
  EvaluationScorer,
  ExplanationResolver,
  EvaluationAssembler,
  EvaluationEngine,
  DuplicateEvaluationError,
  EvaluationPolicyWeightError,
} from '../index.js'

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeSession(overrides?: Partial<ExecutionSession>): ExecutionSession {
  return Object.freeze({
    sessionId: 'session-1',
    executionId: 'exec-1',
    decisionId: 'decision-1',
    planId: 'plan-1',
    state: 'COMPLETED',
    stepRecords: Object.freeze([
      Object.freeze({ stepId: 'step-1', skillId: 'skill-a', state: 'COMPLETED', attemptCount: 1 }),
      Object.freeze({ stepId: 'step-2', skillId: 'skill-b', state: 'COMPLETED', attemptCount: 2 }),
    ]),
    startedAt: new Date('2026-07-22T10:00:00Z'),
    completedAt: new Date('2026-07-22T10:00:01Z'),
    ...overrides,
  } as ExecutionSession)
}

function makeExecution(overrides?: Partial<ExecutionResult>): ExecutionResult {
  return Object.freeze({
    resultId: 'result-1',
    sessionId: 'session-1',
    executionId: 'exec-1',
    decisionId: 'decision-1',
    planId: 'plan-1',
    finalState: 'COMPLETED',
    stepRecords: Object.freeze([]),
    totalDurationMs: 1000,
    completedAt: new Date('2026-07-22T10:00:01Z'),
    ...overrides,
  } as ExecutionResult)
}

function makePredictions(overrides?: Partial<PredictionBundle>): PredictionBundle {
  return Object.freeze({
    predictionId: 'pred-1',
    workingContextId: 'ctx-1',
    budgetPrediction: { estimatedLatencyMs: 900, estimatedTokens: 100, estimatedCostUsd: 0.01 },
    failurePrediction: { failureProbability: 0.1, confidence: 0.9, reasons: [] },
    capabilityPrediction: { ranked: [{ capabilityId: 'cap-1', confidence: 0.8 }] },
    producedAt: new Date(),
    contributors: [],
    ...overrides,
  } as PredictionBundle)
}

function makeDecision(overrides?: Partial<PlanningDecision>): PlanningDecision {
  return Object.freeze({
    decisionId: 'decision-1',
    requestId: 'req-1',
    evaluations: Object.freeze([]),
    selectedPlan: Object.freeze({
      planId: 'plan-1',
      requestId: 'req-1',
      steps: Object.freeze([]),
      budget: Object.freeze({ maxLatencyMs: 2000, maxTokens: 1000 }),
      createdAt: new Date(),
    }),
    selectedScore: 0.9,
    explanation: Object.freeze({
      selectedReason: 'ONLY_CANDIDATE' as const,
      rejectedReasons: Object.freeze([]),
    }),
    metrics: Object.freeze({
      planningDurationMs: 50,
      candidateCount: 1,
      decisionConfidence: 0.85,
      selectionMargin: 0.1,
      planningAlgorithmVersion: '1.0.0',
    }),
    producedAt: new Date(),
    ...overrides,
  } as unknown as PlanningDecision)
}

function makeContext(): WorkingContextIR {
  return Object.freeze({
    contextId: 'ctx-1',
    intent: Object.freeze({ rawInput: 'test', processedText: 'test', confidence: 0.9 }),
    installedCapabilities: Object.freeze([]),
    knowledgeFragments: Object.freeze([]),
    assembledAt: new Date(),
    contributors: Object.freeze([]),
  } as WorkingContextIR)
}

function makeRequest(overrides?: Partial<EvaluationRequest>): EvaluationRequest {
  return Object.freeze({
    evaluationId: 'eval-1',
    context: makeContext(),
    predictions: makePredictions(),
    decision: makeDecision(),
    execution: makeExecution(),
    session: makeSession(),
    requestedAt: new Date(),
    ...overrides,
  } as EvaluationRequest)
}

function makeMockEvents() {
  return { emit: vi.fn(), on: vi.fn(), off: vi.fn() }
}

function makeEngine(policy = DEFAULT_EVALUATION_POLICY, opts?: { replayMode?: boolean }) {
  return new EvaluationEngine(
    new OutcomeCollector(),
    new PredictionComparator(),
    new PlanningComparator(),
    new ExecutionComparator(),
    new EvaluationScorer(),
    new ExplanationResolver(),
    new EvaluationAssembler(),
    policy,
    makeMockEvents(),
    opts,
  )
}

// ─── EvaluationReason frozen const ───────────────────────────────────────────

describe('EvaluationReason', () => {
  it('is frozen', () => {
    expect(Object.isFrozen(EvaluationReason)).toBe(true)
  })
})

// ─── EvaluationEvent frozen const ────────────────────────────────────────────

describe('EvaluationEvent', () => {
  it('is frozen', () => {
    expect(Object.isFrozen(EvaluationEvent)).toBe(true)
  })
})

// ─── DEFAULT_EVALUATION_POLICY ───────────────────────────────────────────────

describe('DEFAULT_EVALUATION_POLICY', () => {
  it('is frozen', () => {
    expect(Object.isFrozen(DEFAULT_EVALUATION_POLICY)).toBe(true)
  })
  it('weights sum to 1.0', () => {
    const sum = DEFAULT_EVALUATION_POLICY.predictionWeight
      + DEFAULT_EVALUATION_POLICY.planningWeight
      + DEFAULT_EVALUATION_POLICY.executionWeight
    expect(Math.abs(sum - 1.0)).toBeLessThan(1e-9)
  })
})

// ─── EvaluationRequest ───────────────────────────────────────────────────────

describe('EvaluationRequest', () => {
  it('constructs correctly', () => {
    const req = makeRequest()
    expect(req.evaluationId).toBe('eval-1')
    expect(req.session.sessionId).toBe('session-1')
  })
  it('is frozen', () => {
    expect(Object.isFrozen(makeRequest())).toBe(true)
  })
  it('has all required fields', () => {
    const req = makeRequest()
    expect(req.predictions).toBeDefined()
    expect(req.decision).toBeDefined()
    expect(req.execution).toBeDefined()
    expect(req.session).toBeDefined()
  })
})

// ─── OutcomeCollector ────────────────────────────────────────────────────────

describe('OutcomeCollector', () => {
  const collector = new OutcomeCollector()

  it('derives totalDurationMs from execution (not session)', () => {
    const result = collector.collect(makeExecution({ totalDurationMs: 500 }), makeSession())
    expect(result.totalDurationMs).toBe(500)
  })

  it('derives stepCount from session.stepRecords', () => {
    const result = collector.collect(makeExecution(), makeSession())
    expect(result.stepCount).toBe(2)
  })

  it('counts failed steps from session', () => {
    const session = makeSession({
      stepRecords: Object.freeze([
        Object.freeze({ stepId: 'a', skillId: 'x', state: 'FAILED', attemptCount: 1 }),
        Object.freeze({ stepId: 'b', skillId: 'y', state: 'COMPLETED', attemptCount: 1 }),
      ] as ExecutionSession['stepRecords']),
    })
    const result = collector.collect(makeExecution(), session)
    expect(result.failedStepCount).toBe(1)
  })

  it('counts retries from session (attemptCount - 1)', () => {
    const session = makeSession()
    // step-2 has attemptCount=2 → 1 retry
    const result = collector.collect(makeExecution(), session)
    expect(result.retryCount).toBe(1)
  })

  it('handles empty step records', () => {
    const session = makeSession({ stepRecords: Object.freeze([]) })
    const result = collector.collect(makeExecution(), session)
    expect(result.stepCount).toBe(0)
    expect(result.failedStepCount).toBe(0)
    expect(result.retryCount).toBe(0)
  })

  it('uses typed ExecutionState for finalState', () => {
    const result = collector.collect(makeExecution({ finalState: 'COMPLETED' }), makeSession())
    expect(result.finalState).toBe('COMPLETED')
  })
})

// ─── PredictionComparator ────────────────────────────────────────────────────

describe('PredictionComparator', () => {
  const comparator = new PredictionComparator()
  const policy = DEFAULT_EVALUATION_POLICY

  const observed: ObservedOutcome = {
    finalState: 'COMPLETED', totalDurationMs: 1000,
    stepCount: 2, failedStepCount: 0, retryCount: 0,
  }

  it('computes latencyErrorMs correctly', () => {
    const result = comparator.compare(makePredictions({ budgetPrediction: { estimatedLatencyMs: 800, estimatedTokens: 0, estimatedCostUsd: 0 } }), observed, policy)
    expect(result.latencyErrorMs).toBe(200)
  })

  it('computes latencyErrorPct correctly', () => {
    const result = comparator.compare(makePredictions({ budgetPrediction: { estimatedLatencyMs: 800, estimatedTokens: 0, estimatedCostUsd: 0 } }), observed, policy)
    expect(result.latencyErrorPct).toBeCloseTo(25, 1)
  })

  it('marks failure prediction correct when both false', () => {
    const result = comparator.compare(makePredictions({ failurePrediction: { failureProbability: 0.1, confidence: 0.9, reasons: [] } }), observed, policy)
    expect(result.failurePredicted).toBe(false)
    expect(result.failureObserved).toBe(false)
    expect(result.failurePredictionCorrect).toBe(true)
  })

  it('marks failure prediction incorrect when mismatch', () => {
    const failedObserved: ObservedOutcome = { ...observed, finalState: 'FAILED' }
    const result = comparator.compare(makePredictions({ failurePrediction: { failureProbability: 0.1, confidence: 0.9, reasons: [] } }), failedObserved, policy)
    expect(result.failurePredictionCorrect).toBe(false)
    expect(result.failureObserved).toBe(true)
  })

  it('treats TIMED_OUT as failure observed', () => {
    const timedOut: ObservedOutcome = { ...observed, finalState: 'TIMED_OUT' }
    const result = comparator.compare(makePredictions(), timedOut, policy)
    expect(result.failureObserved).toBe(true)
  })

  it('handles absent predictions gracefully (all optional)', () => {
    const result = comparator.compare(
      makePredictions({ budgetPrediction: undefined, failurePrediction: undefined, capabilityPrediction: undefined }),
      observed,
      policy,
    )
    expect(result.latencyErrorMs).toBe(1000)
    expect(result.predictionConfidence).toBe(1)
    expect(result.failurePredicted).toBe(false)
  })

  it('uses predictionConfidence from failurePrediction when present', () => {
    const result = comparator.compare(makePredictions({ failurePrediction: { failureProbability: 0.1, confidence: 0.75, reasons: [] } }), observed, policy)
    expect(result.predictionConfidence).toBe(0.75)
  })
})

// ─── PlanningComparator ──────────────────────────────────────────────────────

describe('PlanningComparator', () => {
  const comparator = new PlanningComparator()

  it('planSucceeded true for COMPLETED', () => {
    const observed: ObservedOutcome = { finalState: 'COMPLETED', totalDurationMs: 500, stepCount: 1, failedStepCount: 0, retryCount: 0 }
    const result = comparator.compare(makeDecision(), observed)
    expect(result.planSucceeded).toBe(true)
    expect(result.planExecuted).toBe(true)
  })

  it('planExecuted false for CANCELLED', () => {
    const observed: ObservedOutcome = { finalState: 'CANCELLED', totalDurationMs: 200, stepCount: 1, failedStepCount: 0, retryCount: 0 }
    const result = comparator.compare(makeDecision(), observed)
    expect(result.planExecuted).toBe(false)
    expect(result.planSucceeded).toBe(false)
  })

  it('planSucceeded false for FAILED', () => {
    const observed: ObservedOutcome = { finalState: 'FAILED', totalDurationMs: 500, stepCount: 1, failedStepCount: 1, retryCount: 0 }
    const result = comparator.compare(makeDecision(), observed)
    expect(result.planExecuted).toBe(true)
    expect(result.planSucceeded).toBe(false)
  })

  it('budgetRespected true when within limit', () => {
    const observed: ObservedOutcome = { finalState: 'COMPLETED', totalDurationMs: 500, stepCount: 1, failedStepCount: 0, retryCount: 0 }
    const result = comparator.compare(makeDecision(), observed)
    expect(result.budgetRespected).toBe(true)
  })

  it('budgetRespected false when exceeded', () => {
    const observed: ObservedOutcome = { finalState: 'COMPLETED', totalDurationMs: 5000, stepCount: 1, failedStepCount: 0, retryCount: 0 }
    const result = comparator.compare(makeDecision(), observed)
    expect(result.budgetRespected).toBe(false)
  })

  it('carries planningAlgorithmVersion from decision', () => {
    const observed: ObservedOutcome = { finalState: 'COMPLETED', totalDurationMs: 500, stepCount: 1, failedStepCount: 0, retryCount: 0 }
    const result = comparator.compare(makeDecision(), observed)
    expect(result.planningAlgorithmVersion).toBe('1.0.0')
  })
})

// ─── ExecutionComparator ─────────────────────────────────────────────────────

describe('ExecutionComparator', () => {
  const comparator = new ExecutionComparator()

  it('counts step states from session', () => {
    const session = makeSession({
      stepRecords: Object.freeze([
        Object.freeze({ stepId: 'a', skillId: 'x', state: 'COMPLETED', attemptCount: 1 }),
        Object.freeze({ stepId: 'b', skillId: 'y', state: 'FAILED', attemptCount: 1 }),
        Object.freeze({ stepId: 'c', skillId: 'z', state: 'CANCELLED', attemptCount: 1 }),
      ] as ExecutionSession['stepRecords']),
    })
    const result = comparator.compare(session)
    expect(result.completedSteps).toBe(1)
    expect(result.failedSteps).toBe(1)
    expect(result.cancelledSteps).toBe(1)
  })

  it('counts total retries correctly', () => {
    const session = makeSession()
    // step-2 has attemptCount=2 → 1 retry
    const result = comparator.compare(session)
    expect(result.totalRetries).toBe(1)
  })

  it('computes stepSuccessRate', () => {
    const result = comparator.compare(makeSession())
    expect(result.stepSuccessRate).toBe(1.0) // 2/2
  })

  it('stepSuccessRate is 0 for empty steps', () => {
    const session = makeSession({ stepRecords: Object.freeze([]) })
    const result = comparator.compare(session)
    expect(result.stepSuccessRate).toBe(0)
  })

  it('stepSuccessRate partial', () => {
    const session = makeSession({
      stepRecords: Object.freeze([
        Object.freeze({ stepId: 'a', skillId: 'x', state: 'COMPLETED', attemptCount: 1 }),
        Object.freeze({ stepId: 'b', skillId: 'y', state: 'FAILED', attemptCount: 1 }),
      ] as ExecutionSession['stepRecords']),
    })
    const result = comparator.compare(session)
    expect(result.stepSuccessRate).toBe(0.5)
  })
})

// ─── EvaluationScorer ────────────────────────────────────────────────────────

describe('EvaluationScorer', () => {
  const scorer = new EvaluationScorer()
  const policy = DEFAULT_EVALUATION_POLICY

  const perfectPredComp: PredictionComparison = {
    latencyErrorMs: 0, latencyErrorPct: 0,
    failurePredicted: false, failureObserved: false,
    failurePredictionCorrect: true, topCapabilityHit: true, predictionConfidence: 0.9,
  }
  const perfectPlanComp: PlanningComparison = {
    planExecuted: true, planSucceeded: true, retriesOccurred: false, budgetRespected: true,
    decisionConfidence: 0.85, selectionMargin: 0.1, planningAlgorithmVersion: '1.0.0',
  }
  const perfectExecComp: ExecutionComparison = {
    completedSteps: 2, failedSteps: 0, cancelledSteps: 0, totalRetries: 0,
    durationMs: 1000, stepSuccessRate: 1.0,
  }

  it('VERSION is a string', () => {
    expect(typeof EvaluationScorer.VERSION).toBe('string')
    expect(EvaluationScorer.VERSION.length).toBeGreaterThan(0)
  })

  it('perfect inputs produce overallScore near 1.0', () => {
    const scores = scorer.score(perfectPredComp, perfectPlanComp, perfectExecComp, policy)
    expect(scores.overallScore).toBeCloseTo(1.0, 5)
    expect(scores.predictionAccuracy).toBe(1.0)
    expect(scores.planningAccuracy).toBe(1.0)
    expect(scores.executionEfficiency).toBe(1.0)
  })

  it('failure prediction wrong reduces predictionAccuracy by 0.5', () => {
    const badPred = { ...perfectPredComp, failurePredictionCorrect: false }
    const scores = scorer.score(badPred, perfectPlanComp, perfectExecComp, policy)
    expect(scores.predictionAccuracy).toBe(0.5)
  })

  it('latency over threshold reduces predictionAccuracy by 0.5', () => {
    const badPred = { ...perfectPredComp, latencyErrorPct: 50 }
    const scores = scorer.score(badPred, perfectPlanComp, perfectExecComp, policy)
    expect(scores.predictionAccuracy).toBe(0.5)
  })

  it('both wrong gives predictionAccuracy 0', () => {
    const badPred = { ...perfectPredComp, failurePredictionCorrect: false, latencyErrorPct: 50 }
    const scores = scorer.score(badPred, perfectPlanComp, perfectExecComp, policy)
    expect(scores.predictionAccuracy).toBe(0)
  })

  it('plan executed but not succeeded gives planningAccuracy 0.5', () => {
    const partialPlan = { ...perfectPlanComp, planSucceeded: false, planExecuted: true }
    const scores = scorer.score(perfectPredComp, partialPlan, perfectExecComp, policy)
    expect(scores.planningAccuracy).toBe(0.5)
  })

  it('plan cancelled gives planningAccuracy 0', () => {
    const cancelledPlan = { ...perfectPlanComp, planSucceeded: false, planExecuted: false }
    const scores = scorer.score(perfectPredComp, cancelledPlan, perfectExecComp, policy)
    expect(scores.planningAccuracy).toBe(0)
  })

  it('weight tuning changes overallScore', () => {
    const customPolicy: EvaluationPolicyIR = {
      ...policy, predictionWeight: 1.0, planningWeight: 0, executionWeight: 0,
    }
    // Force weights to sum to 1 — override
    const badPred = { ...perfectPredComp, failurePredictionCorrect: false, latencyErrorPct: 50 }
    const scores = scorer.score(badPred, perfectPlanComp, perfectExecComp, customPolicy)
    expect(scores.overallScore).toBe(0) // all weight on prediction, prediction = 0
  })

  it('all scores in valid range [0..1]', () => {
    const scores = scorer.score(perfectPredComp, perfectPlanComp, perfectExecComp, policy)
    expect(scores.overallScore).toBeGreaterThanOrEqual(0)
    expect(scores.overallScore).toBeLessThanOrEqual(1)
    expect(scores.predictionAccuracy).toBeGreaterThanOrEqual(0)
    expect(scores.planningAccuracy).toBeGreaterThanOrEqual(0)
    expect(scores.executionEfficiency).toBeGreaterThanOrEqual(0)
  })
})

// ─── ExplanationResolver ─────────────────────────────────────────────────────

describe('ExplanationResolver', () => {
  const resolver = new ExplanationResolver()
  const collector = new OutcomeCollector()
  const predComparator = new PredictionComparator()
  const planComparator = new PlanningComparator()
  const execComparator = new ExecutionComparator()
  const scorer = new EvaluationScorer()
  const policy = DEFAULT_EVALUATION_POLICY

  function resolve(session: ExecutionSession, execution: ExecutionResult) {
    const observed = collector.collect(execution, session)
    const predComp = predComparator.compare(makePredictions(), observed, policy)
    const planComp = planComparator.compare(makeDecision(), observed)
    const execComp = execComparator.compare(session)
    const scores = scorer.score(predComp, planComp, execComp, policy)
    return resolver.resolve(observed, predComp, planComp, execComp, scores)
  }

  it('EXECUTION_FAILED for failed execution', () => {
    const session = makeSession({ state: 'FAILED' })
    const execution = makeExecution({ finalState: 'FAILED' })
    const explanation = resolve(session, execution)
    expect(explanation.primaryReason).toBe('EXECUTION_FAILED')
  })

  it('EXECUTION_SUCCESS or PREDICTION_ACCURATE for completed execution', () => {
    const explanation = resolve(makeSession(), makeExecution())
    expect(['PREDICTION_ACCURATE', 'PLAN_OPTIMAL', 'EXECUTION_SUCCESS']).toContain(explanation.primaryReason)
  })

  it('notes contain structured EvaluationNote objects', () => {
    const explanation = resolve(makeSession(), makeExecution())
    for (const note of explanation.notes) {
      expect(typeof note.code).toBe('string')
    }
  })

  it('does not depend on policy — same comparisons produce same result with different weights', () => {
    const observed: ObservedOutcome = {
      finalState: 'COMPLETED', totalDurationMs: 1000, stepCount: 2, failedStepCount: 0, retryCount: 0,
    }
    const predComp = predComparator.compare(makePredictions(), observed, policy)
    const planComp = planComparator.compare(makeDecision(), observed)
    const execComp = execComparator.compare(makeSession())
    const scores1 = scorer.score(predComp, planComp, execComp, policy)
    const customPolicy: EvaluationPolicyIR = { ...policy, predictionWeight: 0.5, planningWeight: 0.3, executionWeight: 0.2 }
    const scores2 = scorer.score(predComp, planComp, execComp, customPolicy)
    const exp1 = resolver.resolve(observed, predComp, planComp, execComp, scores1)
    const exp2 = resolver.resolve(observed, predComp, planComp, execComp, scores2)
    expect(exp1.primaryReason).toBe(exp2.primaryReason)
  })
})

// ─── EvaluationAssembler ─────────────────────────────────────────────────────

describe('EvaluationAssembler', () => {
  const assembler = new EvaluationAssembler()
  const scorer = new EvaluationScorer()

  function assemble(overrides?: Partial<EvaluationRequest>) {
    const req = makeRequest(overrides)
    const collector = new OutcomeCollector()
    const observed = collector.collect(req.execution, req.session)
    const predComp = new PredictionComparator().compare(req.predictions, observed, DEFAULT_EVALUATION_POLICY)
    const planComp = new PlanningComparator().compare(req.decision, observed)
    const execComp = new ExecutionComparator().compare(req.session)
    const scores = scorer.score(predComp, planComp, execComp, DEFAULT_EVALUATION_POLICY)
    const explanation = new ExplanationResolver().resolve(observed, predComp, planComp, execComp, scores)
    return assembler.assemble(req, observed, predComp, planComp, execComp, scores, explanation, DEFAULT_EVALUATION_POLICY, EvaluationScorer.VERSION, 10)
  }

  it('record is frozen (Law 47)', () => {
    expect(Object.isFrozen(assemble())).toBe(true)
  })

  it('policyFingerprint is computed (not empty)', () => {
    const record = assemble()
    expect(record.provenance.policyFingerprint.length).toBeGreaterThan(0)
  })

  it('policyFingerprint not supplied by caller — computed internally', () => {
    // Assembler signature does not accept policyFingerprint — verify it exists in provenance
    const record = assemble()
    expect(typeof record.provenance.policyFingerprint).toBe('string')
  })

  it('recordId is deterministic for identical evidence (Law 51)', () => {
    const r1 = assemble()
    const r2 = assemble()
    expect(r1.recordId).toBe(r2.recordId)
  })

  it('recordId changes when evidence changes', () => {
    const r1 = assemble()
    const r2 = assemble({ execution: makeExecution({ totalDurationMs: 9999 }) })
    expect(r1.recordId).not.toBe(r2.recordId)
  })

  it('recordId does not include evaluationId', () => {
    const r1 = assemble({ evaluationId: 'eval-A' })
    const r2 = assemble({ evaluationId: 'eval-B' })
    // Same evidence, different evaluationId — recordId should be identical
    expect(r1.recordId).toBe(r2.recordId)
  })

  it('policyId stored as pointer (not embedded policy object)', () => {
    const record = assemble()
    expect(record.policyId).toBe('default')
    expect((record as unknown as Record<string, unknown>)['policy']).toBeUndefined()
  })

  it('provenance and telemetry are separate fields', () => {
    const record = assemble()
    expect(record.provenance).toBeDefined()
    expect(record.telemetry).toBeDefined()
    expect(record.telemetry.evaluationDurationMs).toBeGreaterThanOrEqual(0)
    expect((record.provenance as unknown as Record<string, unknown>)['evaluationDurationMs']).toBeUndefined()
  })
})

// ─── EvaluationEngine ────────────────────────────────────────────────────────

describe('EvaluationEngine', () => {
  it('constructor throws EvaluationPolicyWeightError if weights do not sum to 1.0', () => {
    const badPolicy: EvaluationPolicyIR = { ...DEFAULT_EVALUATION_POLICY, predictionWeight: 0.5, planningWeight: 0.5, executionWeight: 0.5 }
    expect(() => makeEngine(badPolicy)).toThrow(EvaluationPolicyWeightError)
  })

  it('constructor throws for weights summing to > 1', () => {
    const badPolicy: EvaluationPolicyIR = { ...DEFAULT_EVALUATION_POLICY, predictionWeight: 0.4, planningWeight: 0.4, executionWeight: 0.4 }
    expect(() => makeEngine(badPolicy)).toThrow(EvaluationPolicyWeightError)
  })

  it('returns EvaluationRecord for valid request', () => {
    const engine = makeEngine()
    const record = engine.evaluate(makeRequest())
    expect(record).toBeDefined()
    expect(record.recordId).toBeTruthy()
    expect(record.scores).toBeDefined()
    expect(record.explanation).toBeDefined()
  })

  it('record is frozen (Law 47)', () => {
    const engine = makeEngine()
    const record = engine.evaluate(makeRequest())
    expect(Object.isFrozen(record)).toBe(true)
  })

  it('evaluate() is synchronous — returns EvaluationRecord directly (not Promise)', () => {
    const engine = makeEngine()
    const result = engine.evaluate(makeRequest())
    expect(result instanceof Promise).toBe(false)
    expect(typeof result.recordId).toBe('string')
  })

  it('throws DuplicateEvaluationError on second call with same sessionId (Law 47)', () => {
    const engine = makeEngine()
    const req = makeRequest()
    engine.evaluate(req)
    expect(() => engine.evaluate(req)).toThrow(DuplicateEvaluationError)
  })

  it('allows duplicate in replayMode', () => {
    const engine = makeEngine(DEFAULT_EVALUATION_POLICY, { replayMode: true })
    const req = makeRequest()
    engine.evaluate(req)
    expect(() => engine.evaluate(req)).not.toThrow()
  })

  it('emits EVALUATION_RECORD_READY with payload including metadata', () => {
    const events = makeMockEvents()
    const engine = new EvaluationEngine(
      new OutcomeCollector(), new PredictionComparator(), new PlanningComparator(),
      new ExecutionComparator(), new EvaluationScorer(), new ExplanationResolver(),
      new EvaluationAssembler(), DEFAULT_EVALUATION_POLICY, events,
    )
    engine.evaluate(makeRequest())
    expect(events.emit).toHaveBeenCalledWith(
      EvaluationEvent.EVALUATION_RECORD_READY,
      expect.objectContaining({
        record: expect.objectContaining({ recordId: expect.any(String) }),
        metadata: expect.objectContaining({ runtimeVersion: expect.any(String), hostId: expect.any(String) }),
      }),
    )
  })

  it('does not mutate policy (Law 49)', () => {
    const engine = makeEngine()
    const policyBefore = JSON.stringify(DEFAULT_EVALUATION_POLICY)
    engine.evaluate(makeRequest())
    expect(JSON.stringify(DEFAULT_EVALUATION_POLICY)).toBe(policyBefore)
  })

  it('deterministic — same inputs produce identical recordId (Law 51)', () => {
    const e1 = makeEngine()
    const e2 = makeEngine()
    const r1 = e1.evaluate(makeRequest())
    const r2 = e2.evaluate(makeRequest())
    expect(r1.recordId).toBe(r2.recordId)
  })

  it('EvaluationRecord shape includes all required fields', () => {
    const engine = makeEngine()
    const record = engine.evaluate(makeRequest())
    expect(record.observedOutcome).toBeDefined()
    expect(record.predictionComparison).toBeDefined()
    expect(record.planningComparison).toBeDefined()
    expect(record.executionComparison).toBeDefined()
    expect(record.scores).toBeDefined()
    expect(record.provenance).toBeDefined()
    expect(record.telemetry).toBeDefined()
    expect(record.explanation).toBeDefined()
    expect(record.producedAt).toBeInstanceOf(Date)
  })

  it('EvaluationRecord is JSON-serializable', () => {
    const engine = makeEngine()
    const record = engine.evaluate(makeRequest())
    expect(() => JSON.stringify(record)).not.toThrow()
  })
})
