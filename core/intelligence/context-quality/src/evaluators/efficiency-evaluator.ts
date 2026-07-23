import { clampScore } from '@rohinik-org/context-quality-ir'
import type { ContextItem } from '@rohinik-org/context-quality-ir'

export class EfficiencyEvaluator {
  evaluate(items: readonly ContextItem[]): number {
    if (items.length <= 1) return 1.0
    const hashes = items.map(i => i.contentHash)
    const unique = new Set(hashes)
    const duplicateRatio = 1 - unique.size / hashes.length
    return clampScore(1.0 - duplicateRatio)
  }
}
