import type { ExecutionRecord } from '@rohinik-org/compiler'
import type { CorpusStorage } from '../storage/corpus-storage.js'
import type { CorpusMetadataEngine } from '../metadata/corpus-metadata-engine.js'
import type { CorpusQuery, CorpusStats } from './corpus-query.js'

function matchesQuery(record: ExecutionRecord, q: CorpusQuery): boolean {
  if (q.skillId !== undefined && record.winnerSkillId !== q.skillId) return false
  if (q.tierId !== undefined && record.winnerTierId !== q.tierId) return false
  if (q.outcome !== undefined && record.outcome !== q.outcome) return false
  if (q.reasoningInvoked !== undefined && record.reasoningInvoked !== q.reasoningInvoked) return false
  if (q.minLatencyMs !== undefined && record.totalLatencyMs < q.minLatencyMs) return false
  if (q.maxLatencyMs !== undefined && record.totalLatencyMs > q.maxLatencyMs) return false
  if (q.maxCostUsd !== undefined && (record.estimatedCostUsd ?? 0) > q.maxCostUsd) return false
  return true
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))] ?? 0
}

export class CorpusQueryEngine {
  constructor(
    private readonly storage: CorpusStorage,
    private readonly metadata: CorpusMetadataEngine,
  ) {}

  async query(q: CorpusQuery): Promise<readonly ExecutionRecord[]> {
    const dateStart = q.dateStart ?? '2000-01-01'
    const dateEnd = q.dateEnd ?? '9999-12-31'
    const results: ExecutionRecord[] = []
    const offset = q.offset ?? 0
    const limit = q.limit ?? 10_000
    let skipped = 0

    for await (const record of this.storage.readRange(dateStart, dateEnd)) {
      if (!matchesQuery(record, q)) continue
      if (skipped < offset) { skipped++; continue }
      results.push(record)
      if (results.length >= limit) break
    }
    return results
  }

  async count(q: CorpusQuery): Promise<number> {
    if (Object.keys(q).length === 0) {
      return this.metadata.getInfo().totalRecords
    }
    const { limit: _l, offset: _o, ...rest } = q
    const results = await this.query(rest)
    return results.length
  }

  async stats(q: CorpusQuery): Promise<CorpusStats> {
    const { limit: _l, offset: _o, ...rest } = q
    const records = await this.query(rest)
    if (records.length === 0) {
      return { total: 0, successRate: 0, latencyPercentiles: {}, reasoningInvokedRate: 0, topSkills: [], topProviders: [] }
    }

    const sorted = [...records.map(r => r.totalLatencyMs)].sort((a, b) => a - b)
    const successCount = records.filter(r => r.outcome === 'SUCCESS').length
    const reasoningCount = records.filter(r => r.reasoningInvoked).length

    const skillCounts = new Map<string, number>()
    const providerCounts = new Map<string, number>()
    let totalCost = 0, costCount = 0

    for (const r of records) {
      if (r.winnerSkillId) skillCounts.set(r.winnerSkillId, (skillCounts.get(r.winnerSkillId) ?? 0) + 1)
      for (const pr of r.providerResolutions) {
        providerCounts.set(pr.providerId, (providerCounts.get(pr.providerId) ?? 0) + 1)
      }
      if (r.estimatedCostUsd !== undefined) { totalCost += r.estimatedCostUsd; costCount++ }
    }

    return {
      total: records.length,
      successRate: successCount / records.length,
      latencyPercentiles: {
        50: percentile(sorted, 50), 90: percentile(sorted, 90),
        95: percentile(sorted, 95), 99: percentile(sorted, 99),
      },
      ...(costCount > 0 ? { avgCostUsd: totalCost / costCount } : {}),
      reasoningInvokedRate: reasoningCount / records.length,
      topSkills: [...skillCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([skillId, count]) => ({ skillId, count })),
      topProviders: [...providerCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([providerId, count]) => ({ providerId, count })),
    }
  }
}
