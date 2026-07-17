import type { RecommendationCandidate } from '../strategies/recommendation-strategy.js'
import type { RecommendationPolicy } from '../policy/recommendation-policy.js'

export class RecommendationRanker {
  rank(
    candidates: readonly RecommendationCandidate[],
    policy: RecommendationPolicy,
  ): RecommendationCandidate[] {
    return [...candidates]
      .filter(c => policy.allowedTypes.includes(c.recommendationType))
      .filter(c => c.rawScore >= policy.minScore)
      .sort((a, b) => {
        const diff = b.rawScore - a.rawScore
        if (diff !== 0) return diff
        return a.nodeId < b.nodeId ? -1 : 1  // stable lexicographic tie-break
      })
      .slice(0, policy.maxResults)
  }
}
