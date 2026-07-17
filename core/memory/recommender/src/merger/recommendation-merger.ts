import type { RecommendationCandidate } from '../strategies/recommendation-strategy.js'

export class RecommendationMerger {
  merge(
    candidates: readonly RecommendationCandidate[],
    anchorIds: ReadonlySet<string>,
  ): RecommendationCandidate[] {
    const map = new Map<string, RecommendationCandidate>()

    for (const c of candidates) {
      if (anchorIds.has(c.nodeId)) continue
      const existing = map.get(c.nodeId)
      if (!existing) {
        map.set(c.nodeId, c)
      } else {
        map.set(c.nodeId, {
          ...existing,
          rawScore: Math.max(existing.rawScore, c.rawScore),
          evidenceSteps: [...existing.evidenceSteps, ...c.evidenceSteps],
          producedBy: [...existing.producedBy, ...c.producedBy],
        })
      }
    }
    return [...map.values()]
  }
}
