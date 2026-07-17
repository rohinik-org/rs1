import type { Observation, ObservationQuery, HttpEvidence } from '@rohinik-org/compiler'
import type { ObservationSource } from './observation-source.js'
import type { NetworkClient } from '@rohinik-org/network'
import { randomUUID } from 'crypto'

export class DocumentationObservationSource implements ObservationSource {
  readonly sourceId = 'documentation'
  readonly category = 'DOCUMENTATION' as const

  constructor(private readonly client: NetworkClient) {}

  async observe(query: ObservationQuery): Promise<readonly Observation[]> {
    const results: Observation[] = []
    for (const term of query.terms) {
      if (!term.startsWith('http')) continue
      try {
        const res = await this.client.request({ requestId: randomUUID(), method: 'GET', url: term, headers: {}, timeoutMs: 10_000 })
        const evidence: HttpEvidence = {
          evidenceId: randomUUID(), kind: 'HTTP', capturedAt: new Date().toISOString(),
          confidence: res.status === 200 ? 0.9 : 0.3, url: term,
          statusCode: res.status, contentType: res.headers['content-type'] ?? 'text/html',
          contentLength: res.body.length,
        }
        results.push({
          observationId: randomUUID(), sourceId: this.sourceId, observedAt: new Date().toISOString(),
          category: 'DOCUMENTATION', confidence: evidence.confidence, evidence: [evidence], tags: [term],
          summary: `Documentation at ${term}: status=${res.status}`,
        })
      } catch { /* skip failed fetches */ }
    }
    return results
  }
}
