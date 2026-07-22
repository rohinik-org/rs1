import type {
  PredictionComparison,
  PlanningComparison,
  ExecutionComparison,
  EvaluationPolicyIR,
  EvaluationScores,
} from '@rohinik-org/evaluation-ir'

export class EvaluationScorer {
  static readonly VERSION = '1.0.0'

  score(
    predComp: PredictionComparison,
    planComp: PlanningComparison,
    execComp: ExecutionComparison,
    policy: EvaluationPolicyIR,
  ): EvaluationScores {
    // Formal scoring definition (Law 51 depends on this being exact):
    // FailureComponent  ∈ {0, 0.5} — 0.5 if failurePredictionCorrect, else 0
    // LatencyComponent  ∈ {0, 0.5} — 0.5 if latencyErrorPct ≤ latencyThresholdPct, else 0
    // predictionAccuracy = FailureComponent + LatencyComponent → ∈ {0, 0.5, 1.0}
    const failureComponent = predComp.failurePredictionCorrect ? 0.5 : 0
    const latencyComponent = predComp.latencyErrorPct <= policy.latencyThresholdPct ? 0.5 : 0
    const predictionAccuracy = failureComponent + latencyComponent

    // planningAccuracy = planSucceeded?1.0:(planExecuted?0.5:0) → ∈ {0, 0.5, 1.0}
    const planningAccuracy = planComp.planSucceeded ? 1.0 : (planComp.planExecuted ? 0.5 : 0)

    // executionEfficiency = stepSuccessRate → ∈ [0..1]
    const executionEfficiency = execComp.stepSuccessRate

    // overallScore = weighted sum per policy (INVARIANT: weights sum to 1.0)
    const overallScore =
      predictionAccuracy * policy.predictionWeight +
      planningAccuracy * policy.planningWeight +
      executionEfficiency * policy.executionWeight

    return Object.freeze({ overallScore, predictionAccuracy, planningAccuracy, executionEfficiency })
  }
}
