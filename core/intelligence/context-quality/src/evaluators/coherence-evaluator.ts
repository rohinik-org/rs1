import { clampScore } from '@rohinik-org/context-quality-ir'
import type { ContextItem, ContextRelationship } from '@rohinik-org/context-quality-ir'

export class CoherenceEvaluator {
  evaluate(items: readonly ContextItem[], relationships: readonly ContextRelationship[]): number {
    if (items.length === 0) return 1.0

    const itemIds = new Set(items.map(i => i.itemId))
    let violations = 0
    const total = relationships.length + items.length

    for (const rel of relationships) {
      if (!itemIds.has(rel.fromItemId) || !itemIds.has(rel.toItemId)) violations++
      if (rel.fromItemId === rel.toItemId) violations++
    }

    const contradicts = relationships.filter(r => r.kind === 'contradicts')
    for (const rel of contradicts) {
      const from = items.find(i => i.itemId === rel.fromItemId)
      const to   = items.find(i => i.itemId === rel.toItemId)
      if (from?.conflictState === 'unresolved' && to?.conflictState === 'unresolved') violations += 2
    }

    if (total === 0) return 1.0
    return clampScore(1.0 - violations / Math.max(total, 1))
  }
}
