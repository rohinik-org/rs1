import type { ContextRanker } from '@rohinik-org/scoring'
import type { PlanningRequest } from '@rohinik-org/planner-ir'
import type { PlanCandidate } from './plan-generator.js'

export class PlanEvaluator {
  constructor(private readonly ranker: ContextRanker) {}

  evaluate(
    candidates: ReadonlyArray<PlanCandidate>,
    request: PlanningRequest,
  ): ReadonlyArray<PlanCandidate> {
    const { context, predictions, planningPolicy: policy } = request
    const terms = [...context.intent.concepts, ...context.intent.preferredSkills]
    const failureProb = predictions.failurePrediction?.failureProbability ?? 0

    const scored = candidates.map(c => {
      // Cap match score [0,1]
      const stepSkills = [...new Set(c.executionPlan.steps.map(s => s.skillId))]
      const capScore = stepSkills.length > 0
        ? stepSkills.reduce((sum, skillId) => {
            const cap = context.installedCapabilities.find(ic => ic.capabilityId === skillId)
            return sum + (cap ? this.ranker.scoreCapability(cap, terms) : 0)
          }, 0) / stepSkills.length
        : 0

      // Risk penalty
      const riskPenalty = failureProb * (1 - policy.riskTolerance)

      // Policy bonuses (additive, small so cap match dominates)
      const latencyBonus = policy.preferLowerLatency ? Math.max(0, 1 - c.estimatedLatencyMs / 10000) * 0.1 : 0
      const costBonus = policy.preferLowerCost ? Math.max(0, 1 - c.estimatedCostUsd * 1000) * 0.05 : 0
      const installedBonus = policy.preferInstalledCapabilities &&
        c.executionPlan.steps.every(s => context.installedCapabilities.some(ic => ic.capabilityId === s.skillId))
        ? 0.15 : 0

      const score = Math.min(1, Math.max(0,
        capScore + installedBonus + latencyBonus + costBonus - riskPenalty
      ))

      return Object.freeze({ ...c, score, predictedFailureProbability: failureProb })
    })

    // Sort: score DESC, latencyMs ASC, costUsd ASC, candidateId ASC (Law 43 determinism)
    return Object.freeze([...scored].sort((a, b) => {
      if (Math.abs(a.score - b.score) > 1e-9) return b.score - a.score
      if (a.estimatedLatencyMs !== b.estimatedLatencyMs) return a.estimatedLatencyMs - b.estimatedLatencyMs
      if (a.estimatedCostUsd !== b.estimatedCostUsd) return a.estimatedCostUsd - b.estimatedCostUsd
      return a.candidateId.localeCompare(b.candidateId)
    }))
  }
}
