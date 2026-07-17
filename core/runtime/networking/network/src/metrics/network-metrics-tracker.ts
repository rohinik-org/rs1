import type { NetworkJournalEntry, NetworkMetrics } from '@rohinik-org/compiler'

export class NetworkMetricsTracker {
  compute(entries: readonly NetworkJournalEntry[]): NetworkMetrics {
    const started = entries.filter(e => e.kind === 'REQUEST_STARTED').length
    const completed = entries.filter(e => e.kind === 'REQUEST_COMPLETED')
    const failed = entries.filter(e => e.kind === 'REQUEST_FAILED').length
    const cacheHits = entries.filter(e => e.kind === 'CACHE_HIT').length
    const latencies = completed.map(e => e.latencyMs ?? 0)
    const avgLatency = latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0
    const cacheHitRate = started > 0 ? cacheHits / started : 0
    return {
      requestCount: started,
      successCount: completed.length,
      failureCount: failed,
      cacheHitRate,
      averageLatencyMs: avgLatency,
      averageResponseSizeBytes: 0,
    }
  }
}
