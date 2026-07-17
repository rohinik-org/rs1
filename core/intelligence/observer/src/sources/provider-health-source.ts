import type { Observation, ObservationQuery, ProviderMetricsEvidence } from '@rohinik-org/compiler'
import type { ObservationSource } from './observation-source.js'
import { randomUUID } from 'crypto'

// ponytail: duck-typed interface — avoids @rohinik-org/observer importing @rohinik-org/orchestrator (would create dependency cycle)
export interface ProviderStatsProvider {
  list(): ReadonlyArray<{ providerId: string }>
  stats(providerId: string): { callCount: number; successRate: number; avgLatencyMs: number }
}

export class ProviderHealthSource implements ObservationSource {
  readonly sourceId = 'provider-health'
  readonly category = 'PROVIDER' as const

  constructor(private readonly metrics: ProviderStatsProvider) {}

  async observe(_query: ObservationQuery): Promise<readonly Observation[]> {
    const providers = this.metrics.list()
    if (providers.length === 0) return []

    return providers.map(p => {
      const stats = this.metrics.stats(p.providerId)
      if (stats.callCount === 0) return null
      const evidence: ProviderMetricsEvidence = {
        evidenceId: randomUUID(), kind: 'PROVIDER_METRICS', capturedAt: new Date().toISOString(),
        confidence: Math.min(1, stats.callCount / 10),
        latencyMs: stats.avgLatencyMs, errorRate: 1 - stats.successRate,
        successRate: stats.successRate, sampleSize: stats.callCount,
      }
      const obs: Observation = {
        observationId: randomUUID(), sourceId: this.sourceId, observedAt: new Date().toISOString(),
        category: 'PROVIDER', confidence: evidence.confidence, evidence: [evidence], tags: [p.providerId],
        summary: `Provider ${p.providerId}: successRate=${stats.successRate.toFixed(2)}`,
      }
      return obs
    }).filter((o): o is Observation => o !== null)
  }
}
