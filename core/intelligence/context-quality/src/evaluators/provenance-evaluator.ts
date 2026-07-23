import { clampScore } from '@rohinik-org/context-quality-ir'
import type { ContextItem } from '@rohinik-org/context-quality-ir'

const TRANSFORMATION_REQUIRED = new Set(['derived', 'summary', 'extract'])

export class ProvenanceEvaluator {
  evaluate(items: readonly ContextItem[]): number {
    if (items.length === 0) return 1.0

    const scores = items.map(item => {
      const { provenance, representation } = item

      if (!provenance.sourceId) return 0.0

      if (TRANSFORMATION_REQUIRED.has(representation) && provenance.transformations.length === 0) {
        return 0.0
      }

      let score = 0.6
      if (representation !== 'derived')             score += 0.2
      if (provenance.transformations.length > 0)    score += 0.1
      if (provenance.sourceKind !== 'generated')    score += 0.1
      return clampScore(score)
    })

    return clampScore(scores.reduce((s, v) => s + v, 0) / scores.length)
  }
}
