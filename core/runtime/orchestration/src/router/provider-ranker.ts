import type { ProviderEntry, ProviderScore, RoutingPolicy } from '@rohinik-org/compiler'

const COST_SCORE: Record<string, number> = { free: 1.0, low: 0.75, medium: 0.5, high: 0.25 }
const LATENCY_SCORE: Record<string, number> = { 'very-low': 1.0, low: 0.75, medium: 0.5, high: 0.25 }

export class ProviderRanker {
  rank(candidates: readonly ProviderEntry[], skillTags: readonly string[], policy: RoutingPolicy): ProviderScore[] {
    const scores = candidates.map(p => {
      const capabilityScore = skillTags.length === 0
        ? 1.0
        : skillTags.filter(t => p.supportedSkillTags.includes(t)).length / skillTags.length
      const costScore = COST_SCORE[p.estimatedCostTier] ?? 0
      const latencyScore = LATENCY_SCORE[p.estimatedLatencyTier] ?? 0
      const policyScore = policy.preferredProviders.includes(p.providerId) ? 1.0 : 0.5
      const finalScore = 0.35 * capabilityScore + 0.25 * costScore + 0.25 * latencyScore + 0.15 * policyScore
      return { providerId: p.providerId, capabilityScore, costScore, latencyScore, policyScore, finalScore }
    })

    return scores.sort((a, b) => b.finalScore - a.finalScore)
  }
}
