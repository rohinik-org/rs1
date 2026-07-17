import type { MemoryQuery, MemoryResult } from '@rohinik-org/compiler'
import type { MemoryStore } from '../store/memory-store.js'
import type { MemoryRanker } from '../ranking/memory-ranker.js'

export class RetrievalEngine {
  constructor(
    private readonly store: MemoryStore,
    private readonly ranker: MemoryRanker,
  ) {}

  async recall(query: MemoryQuery): Promise<MemoryResult[]> {
    const { limit: _limit, ...queryWithoutLimit } = query
    const all = await this.store.findRelevant(queryWithoutLimit)
    const filtered = _applyOutcomeFilter(all, query.outcomeFilter)
    const ranked = this.ranker.rank(filtered, query)
    return query.limit !== undefined ? ranked.slice(0, query.limit) : ranked
  }
}

function _applyOutcomeFilter(
  artifacts: ReturnType<typeof Object.values>,
  filter: MemoryQuery['outcomeFilter'],
) {
  if (!filter || filter === 'ANY') return artifacts
  return artifacts.filter(a => {
    const outcome = (a.content as Record<string, unknown>).outcome
    return outcome === filter
  })
}
