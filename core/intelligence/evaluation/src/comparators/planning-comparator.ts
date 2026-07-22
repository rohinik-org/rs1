import type { PlanningDecision, ObservedOutcome, PlanningComparison } from '@rohinik-org/evaluation-ir'

export class PlanningComparator {
  compare(decision: PlanningDecision, observed: ObservedOutcome): PlanningComparison {
    const planExecuted = observed.finalState !== 'CANCELLED'
    const planSucceeded = observed.finalState === 'COMPLETED'
    const retriesOccurred = observed.retryCount > 0

    const maxLatencyMs = decision.selectedPlan.budget.maxLatencyMs
    const budgetRespected =
      maxLatencyMs !== undefined && maxLatencyMs !== null
        ? observed.totalDurationMs <= maxLatencyMs
        : true

    return Object.freeze({
      planExecuted,
      planSucceeded,
      retriesOccurred,
      budgetRespected,
      decisionConfidence: decision.metrics.decisionConfidence,
      selectionMargin: decision.metrics.selectionMargin,
      planningAlgorithmVersion: decision.metrics.planningAlgorithmVersion,
    })
  }
}
