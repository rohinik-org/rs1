import type { ExecutionResult, ExecutionSession, ExecutionState } from '@rohinik-org/execution-ir'
import type { PredictionBundle } from '@rohinik-org/prediction-ir'
import type { PlanningDecision } from '@rohinik-org/planner-ir'
import type { WorkingContextIR } from '@rohinik-org/working-context'

export type { ExecutionResult, ExecutionSession, ExecutionState, PredictionBundle, PlanningDecision, WorkingContextIR }

export interface EvaluationRequest {
  readonly evaluationId: string
  readonly context: WorkingContextIR
  readonly predictions: PredictionBundle
  readonly decision: PlanningDecision
  readonly execution: ExecutionResult       // duration + final state summary
  readonly session: ExecutionSession        // canonical step graph — all step stats derived here
  readonly requestedAt: Date
}

// Observed facts — derived from ExecutionSession (step stats) + ExecutionResult (duration)
// No scoring, no inference (Law 48)
export interface ObservedOutcome {
  readonly finalState: ExecutionState       // typed — not string
  readonly totalDurationMs: number          // from execution.totalDurationMs
  readonly stepCount: number                // session.stepRecords.length
  readonly failedStepCount: number          // steps where state === 'FAILED'
  readonly retryCount: number               // sum of (step.attemptCount - 1) across steps
  readonly cancelledAt?: Date               // from session.cancelledAt
}

// Comparators consume threshold values only — never inspect policyId or policyVersion
export interface PredictionComparison {
  readonly latencyErrorMs: number           // abs(budgetPrediction.estimatedLatencyMs - actualDurationMs)
  readonly latencyErrorPct: number          // latencyErrorMs / predicted * 100
  readonly failurePredicted: boolean        // failurePrediction.failureProbability >= threshold
  readonly failureObserved: boolean         // finalState === 'FAILED' || 'TIMED_OUT'
  readonly failurePredictionCorrect: boolean
  readonly topCapabilityHit: boolean        // capabilityPrediction.ranked[0] in completed steps
  readonly predictionConfidence: number     // failurePrediction.confidence (or 1 if absent)
}

export interface PlanningComparison {
  readonly planExecuted: boolean            // finalState !== 'CANCELLED'
  readonly planSucceeded: boolean           // finalState === 'COMPLETED'
  readonly retriesOccurred: boolean         // retryCount > 0
  readonly budgetRespected: boolean         // actualDurationMs <= budget.maxLatencyMs (if set)
  readonly decisionConfidence: number       // from decision.metrics.decisionConfidence
  readonly selectionMargin: number          // from decision.metrics.selectionMargin
  readonly planningAlgorithmVersion: string // from decision.metrics.planningAlgorithmVersion
}

export interface ExecutionComparison {
  readonly completedSteps: number
  readonly failedSteps: number
  readonly cancelledSteps: number
  readonly totalRetries: number
  readonly durationMs: number
  readonly stepSuccessRate: number          // completedSteps / stepCount (0 if no steps)
}

// Derived scores — deterministic f(comparisons, policy weights). Not an independent source of truth.
// Replay: same inputs + same policy = same scores (Law 51)
export interface EvaluationScores {
  readonly overallScore: number             // [0..1]: weighted sum per policy weights
  readonly predictionAccuracy: number       // [0..1]: FailureComponent + LatencyComponent
  readonly planningAccuracy: number         // [0..1]: planSucceeded?1.0:(planExecuted?0.5:0)
  readonly executionEfficiency: number      // [0..1]: stepSuccessRate
}

export const EvaluationReason = Object.freeze({
  PREDICTION_ACCURATE:   'PREDICTION_ACCURATE',
  PREDICTION_INACCURATE: 'PREDICTION_INACCURATE',
  PLAN_OPTIMAL:          'PLAN_OPTIMAL',
  PLAN_SUBOPTIMAL:       'PLAN_SUBOPTIMAL', // reserved: PLAN_SLOWER/BUDGET_EXCEEDED/RETRIED/CANCELLED — Stage 13
  EXECUTION_SUCCESS:     'EXECUTION_SUCCESS',
  EXECUTION_FAILED:      'EXECUTION_FAILED',
  BUDGET_EXCEEDED:       'BUDGET_EXCEEDED',
  LOW_CONFIDENCE:        'LOW_CONFIDENCE',
} as const)
export type EvaluationReason = typeof EvaluationReason[keyof typeof EvaluationReason]

// Structured notes — code + args for i18n/UI rendering (Stage 13+). Never plain strings.
export interface EvaluationNote {
  readonly code: string
  readonly args?: Readonly<Record<string, unknown>>
}

export interface EvaluationExplanation {
  readonly primaryReason: EvaluationReason
  readonly notes: ReadonlyArray<EvaluationNote>
}

export interface EvaluationPolicyIR {
  readonly policyId: string
  readonly policyVersion: string            // bumped when weights/thresholds change
  readonly latencyThresholdPct: number      // latency error % above which prediction is "inaccurate"
  readonly failureConfidenceThreshold: number // failureProbability >= this = predicted failure
  readonly predictionWeight: number         // [0..1], default 0.33
  readonly planningWeight: number           // [0..1], default 0.33
  readonly executionWeight: number          // [0..1], default 0.34
  // INVARIANT: predictionWeight + planningWeight + executionWeight === 1.0
  // Validated by EvaluationEngine constructor — throws EvaluationPolicyWeightError if violated
}

export const DEFAULT_EVALUATION_POLICY: EvaluationPolicyIR = Object.freeze({
  policyId: 'default',
  policyVersion: '1.0.0',
  latencyThresholdPct: 25,
  failureConfidenceThreshold: 0.5,
  predictionWeight: 0.33,
  planningWeight: 0.33,
  executionWeight: 0.34,
})

export const EvaluationEvent = Object.freeze({
  EVALUATION_RECORD_READY: 'EVALUATION_RECORD_READY',
} as const)
export type EvaluationEvent = typeof EvaluationEvent[keyof typeof EvaluationEvent]

// Replay identity fields — separated from runtime telemetry for clean Law 51 semantics
export interface EvaluationProvenance {
  readonly scorerVersion: string            // EvaluationScorer.VERSION — bumped when formula changes
  readonly policyFingerprint: string        // SHA256(policyId+policyVersion+weights+thresholds) — computed by assembler
  // NOTE: policyFingerprint intentionally excludes scorerVersion — scorerVersion already participates
  // independently in recordId. Including it in both would be redundancy, not stronger identity.
  readonly decisionId: string               // denormalized for debugger convenience
  readonly executionId: string              // denormalized for debugger convenience
  readonly predictionId?: string            // from predictions.predictionId if present
}

// Runtime metadata — NOT evidence. Exempt from Law 51 replay guarantee.
export interface EvaluationTelemetry {
  readonly evaluationDurationMs: number     // wall-clock time — varies between runs, not part of recordId
}

export interface EvaluationRecord {
  // recordId: SHA256(canonicalJSON(observed) + canonicalJSON(predComp) + canonicalJSON(planComp)
  //                  + canonicalJSON(execComp) + scorerVersion + policyFingerprint)
  // canonicalJSON = JSON.stringify(obj, Object.keys(obj).sort()) — stable key order across runtimes
  // evaluationId intentionally excluded — replay identity depends on evidence + algorithm, not request ID
  // producedAt intentionally excluded — replay must produce identical recordId (Law 47 + Law 51)
  // telemetry.evaluationDurationMs intentionally excluded — telemetry, not evidence
  readonly recordId: string
  readonly evaluationId: string             // request identifier — NOT part of recordId
  readonly requestId: string
  readonly decisionId: string
  readonly executionId: string
  readonly sessionId: string
  readonly policyId: string                 // pointer — not embedded (policies are config, records are evidence)
  readonly policyVersion: string            // human reference snapshot
  readonly observedOutcome: ObservedOutcome
  readonly predictionComparison: PredictionComparison
  readonly planningComparison: PlanningComparison
  readonly executionComparison: ExecutionComparison
  readonly scores: EvaluationScores         // derived — deterministic f() of comparisons + policy weights
  readonly provenance: EvaluationProvenance
  readonly telemetry: EvaluationTelemetry   // runtime metadata — exempt from Law 51
  readonly explanation: EvaluationExplanation
  readonly producedAt: Date
}

// Event payload — record + original request + host metadata so Stage 11 never needs a second event
export interface EvaluationRecordReadyPayload {
  readonly record: EvaluationRecord
  readonly request: EvaluationRequest       // included so ExperienceRecorder can access WorkingContextIR
  readonly metadata: {
    readonly runtimeVersion: string
    readonly hostId: string
    readonly timestamp: Date
  }
}
