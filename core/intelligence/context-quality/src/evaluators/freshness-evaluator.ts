import { clampScore } from '@rohinik-org/context-quality-ir'
import type { ContextItem, ContextRequirement } from '@rohinik-org/context-quality-ir'

const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

function ageScore(ageMs: number, maxAge: number): number {
  if (ageMs <= 0)      return 1.0
  if (ageMs >= maxAge) return 0.0
  return 1.0 - ageMs / maxAge
}

export class FreshnessEvaluator {
  evaluate(items: readonly ContextItem[], requirements: readonly ContextRequirement[]): number {
    if (items.length === 0) return 1.0

    const scores = items.map(item => {
      if (!item.temporalValidity) return 0.5

      const { ageMs } = item.temporalValidity

      const supportedReqs = requirements.filter(r =>
        item.relevance.requirementRefs.includes(r.requirementId) && r.maximumAgeMs !== undefined
      )

      if (supportedReqs.length === 0) {
        return ageScore(ageMs, DEFAULT_MAX_AGE_MS)
      }

      // Tightest applicable requirement determines freshness — Math.min not average
      const reqScores = supportedReqs.map(r => ageScore(ageMs, r.maximumAgeMs!))
      return Math.min(...reqScores)
    })

    return clampScore(scores.reduce((s, v) => s + v, 0) / scores.length)
  }
}
