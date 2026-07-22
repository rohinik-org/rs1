import type {
  ObservedOutcome,
  PredictionComparison,
  PlanningComparison,
  ExecutionComparison,
  EvaluationScores,
  EvaluationExplanation,
  EvaluationReason as EvaluationReasonType,
} from '@rohinik-org/evaluation-ir'
import { EvaluationReason } from '@rohinik-org/evaluation-ir'

export class ExplanationResolver {
  // Does NOT receive policy — explanation must not change when only weights change (Law 51 replay safety)
  resolve(
    observed: ObservedOutcome,
    predComp: PredictionComparison,
    planComp: PlanningComparison,
    execComp: ExecutionComparison,
    scores: EvaluationScores,
  ): EvaluationExplanation {
    const notes: Array<{ code: string; args?: Record<string, unknown> }> = []
    let primaryReason: EvaluationReasonType

    if (observed.finalState === 'FAILED' || observed.finalState === 'TIMED_OUT') {
      primaryReason = EvaluationReason.EXECUTION_FAILED
      notes.push({ code: 'EXECUTION_FAILED', args: { finalState: observed.finalState } })
    } else if (observed.finalState === 'CANCELLED') {
      primaryReason = EvaluationReason.PLAN_SUBOPTIMAL
      notes.push({ code: 'EXECUTION_CANCELLED' })
    } else if (!planComp.budgetRespected) {
      primaryReason = EvaluationReason.BUDGET_EXCEEDED
      notes.push({ code: 'BUDGET_EXCEEDED', args: { durationMs: observed.totalDurationMs } })
    } else if (scores.predictionAccuracy >= 1.0 && scores.planningAccuracy >= 1.0) {
      primaryReason = EvaluationReason.PREDICTION_ACCURATE
      if (planComp.planSucceeded) notes.push({ code: 'PLAN_SUCCEEDED' })
    } else if (scores.predictionAccuracy < 0.5) {
      primaryReason = EvaluationReason.PREDICTION_INACCURATE
      if (!predComp.failurePredictionCorrect) {
        notes.push({ code: 'FAILURE_PREDICTION_INCORRECT', args: { predicted: predComp.failurePredicted, observed: predComp.failureObserved } })
      }
      if (predComp.latencyErrorPct > 0) {
        notes.push({ code: 'LATENCY_ERROR', args: { errorPct: Math.round(predComp.latencyErrorPct), errorMs: Math.round(predComp.latencyErrorMs) } })
      }
    } else if (scores.planningAccuracy < 1.0) {
      primaryReason = EvaluationReason.PLAN_SUBOPTIMAL
      if (execComp.totalRetries > 0) {
        notes.push({ code: 'RETRIES_OCCURRED', args: { retries: execComp.totalRetries } })
      }
    } else if (predComp.predictionConfidence < 0.5) {
      primaryReason = EvaluationReason.LOW_CONFIDENCE
      notes.push({ code: 'LOW_PREDICTION_CONFIDENCE', args: { confidence: predComp.predictionConfidence } })
    } else if (planComp.planSucceeded) {
      primaryReason = EvaluationReason.PLAN_OPTIMAL
      notes.push({ code: 'PLAN_SUCCEEDED' })
    } else {
      primaryReason = EvaluationReason.PREDICTION_ACCURATE
    }

    if (observed.failedStepCount > 0) {
      notes.push({ code: 'FAILED_STEPS', args: { count: observed.failedStepCount } })
    }

    return Object.freeze({
      primaryReason,
      notes: Object.freeze(notes.map(n => Object.freeze(n))),
    })
  }
}
