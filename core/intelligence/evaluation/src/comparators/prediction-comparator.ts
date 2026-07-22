import type {
  PredictionBundle,
  ObservedOutcome,
  EvaluationPolicyIR,
  PredictionComparison,
} from '@rohinik-org/evaluation-ir'

export class PredictionComparator {
  // Consumes threshold values only — never inspects policyId or policyVersion (Law 48)
  compare(
    predictions: PredictionBundle,
    observed: ObservedOutcome,
    policy: EvaluationPolicyIR,
  ): PredictionComparison {
    const predicted = predictions.budgetPrediction?.estimatedLatencyMs ?? 0
    const latencyErrorMs = Math.abs(predicted - observed.totalDurationMs)
    const latencyErrorPct = predicted > 0 ? (latencyErrorMs / predicted) * 100 : 0

    const failureProbability = predictions.failurePrediction?.failureProbability ?? 0
    const failurePredicted = failureProbability >= policy.failureConfidenceThreshold
    const failureObserved = observed.finalState === 'FAILED' || observed.finalState === 'TIMED_OUT'
    const failurePredictionCorrect = failurePredicted === failureObserved

    const completedStepIds = new Set(
      predictions.capabilityPrediction?.ranked.map(r => r.capabilityId) ?? [],
    )
    const topCapabilityId = predictions.capabilityPrediction?.ranked[0]?.capabilityId
    const topCapabilityHit = topCapabilityId !== undefined && completedStepIds.has(topCapabilityId)

    return Object.freeze({
      latencyErrorMs,
      latencyErrorPct,
      failurePredicted,
      failureObserved,
      failurePredictionCorrect,
      topCapabilityHit,
      predictionConfidence: predictions.failurePrediction?.confidence ?? 1,
    })
  }
}
