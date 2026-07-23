import { clampScore } from '@rohinik-org/context-quality-ir'
import type { ContextItem, ContextRelationship } from '@rohinik-org/context-quality-ir'

export class ConsistencyEvaluator {
  evaluate(items: readonly ContextItem[], relationships: readonly ContextRelationship[]): number {
    if (items.length === 0) return 1.0

    const unresolvedCount = items.filter(i => i.conflictState === 'unresolved').length
    const resolvedCount   = items.filter(i => i.conflictState === 'resolved').length

    const superseded    = relationships.filter(r => r.kind === 'supersedes')
    const supersededIds = new Set(superseded.map(r => r.toItemId))
    const itemIds       = new Set(items.map(i => i.itemId))
    const staleSupersededCount = [...supersededIds].filter(id => itemIds.has(id)).length

    const penalty = (unresolvedCount * 0.4 + resolvedCount * 0.05 + staleSupersededCount * 0.1) / items.length
    return clampScore(1.0 - penalty)
  }
}
