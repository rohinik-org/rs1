import { clampScore } from '@rohinik-org/context-quality-ir'
import type { ContextItem } from '@rohinik-org/context-quality-ir'

export class AuthorityEvaluator {
  evaluate(items: readonly ContextItem[]): number {
    if (items.length === 0) return 1.0
    return clampScore(items.reduce((sum, item) => sum + item.authority.score, 0) / items.length)
  }
}
