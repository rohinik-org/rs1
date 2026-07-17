import type { Observation, ObservationQuery, RegistryEvidence } from '@rohinik-org/compiler'
import type { ObservationSource } from './observation-source.js'
import type { NetworkClient } from '@rohinik-org/network'
import { randomUUID } from 'crypto'

export class NpmObservationSource implements ObservationSource {
  readonly sourceId = 'npm-registry'
  readonly category = 'PACKAGE' as const

  constructor(private readonly client: NetworkClient) {}

  async observe(query: ObservationQuery): Promise<readonly Observation[]> {
    const results: Observation[] = []
    for (const term of query.terms) {
      try {
        const res = await this.client.request({ requestId: randomUUID(), method: 'GET', url: `https://registry.npmjs.org/${encodeURIComponent(term)}`, headers: { Accept: 'application/json' }, timeoutMs: 10_000 })
        if (res.status !== 200) continue
        const data = JSON.parse(res.body) as { name?: string; deprecated?: string; time?: Record<string, string> }
        const latest = data.time?.modified ?? new Date().toISOString()
        const evidence: RegistryEvidence = {
          evidenceId: randomUUID(), kind: 'REGISTRY', capturedAt: new Date().toISOString(),
          confidence: 0.95, packageName: data.name ?? term, version: 'latest',
          deprecated: Boolean(data.deprecated), publishedAt: latest,
        }
        results.push({
          observationId: randomUUID(), sourceId: this.sourceId, observedAt: new Date().toISOString(),
          category: 'PACKAGE', confidence: 0.95, evidence: [evidence], tags: [term],
          summary: `npm package ${term}: deprecated=${evidence.deprecated}`,
        })
      } catch { /* skip failed package lookups */ }
    }
    return results
  }
}
