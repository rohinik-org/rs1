import type { ReasoningReport, ReasoningQuery } from '@rohinik-org/compiler'
import type { ReasoningStore } from './reasoning-store.js'

export class NullReasoningStore implements ReasoningStore {
  private readonly map = new Map<string, ReasoningReport>()

  async save(report: ReasoningReport): Promise<void> { this.map.set(report.reportId, report) }
  async get(reportId: string): Promise<ReasoningReport | undefined> { return this.map.get(reportId) }
  async list(): Promise<readonly ReasoningReport[]> { return Array.from(this.map.values()) }
  async latest(): Promise<ReasoningReport | undefined> {
    return Array.from(this.map.values()).sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))[0]
  }
  async search(query: ReasoningQuery): Promise<readonly ReasoningReport[]> {
    return applyQuery(Array.from(this.map.values()), query)
  }
  async removeById(reportId: string): Promise<boolean> { return this.map.delete(reportId) }
}

export function applyQuery(reports: ReasoningReport[], query: ReasoningQuery): ReasoningReport[] {
  let results = reports
  if (query.category !== undefined) results = results.filter(r => r.hypothesisSet.some(h => h.category === query.category))
  if (query.action !== undefined) results = results.filter(r => r.recommendationSet.some(rec => rec.action === query.action))
  if (query.minConfidence !== undefined) results = results.filter(r => r.hypothesisSet.some(h => h.confidence >= query.minConfidence!))
  if (query.limit !== undefined) results = results.slice(0, query.limit)
  return results
}
