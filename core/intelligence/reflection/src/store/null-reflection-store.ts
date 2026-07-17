import type { ReflectionReport, ReflectionQuery } from '@rohinik-org/compiler'
import type { ReflectionStore } from './reflection-store.js'

export class NullReflectionStore implements ReflectionStore {
  private readonly map = new Map<string, ReflectionReport>()

  async save(report: ReflectionReport): Promise<void> {
    this.map.set(report.reportId, report)
  }

  async get(reportId: string): Promise<ReflectionReport | undefined> {
    return this.map.get(reportId)
  }

  async list(): Promise<readonly ReflectionReport[]> {
    return Array.from(this.map.values())
  }

  async latest(): Promise<ReflectionReport | undefined> {
    const all = Array.from(this.map.values())
    return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  }

  async search(query: ReflectionQuery): Promise<readonly ReflectionReport[]> {
    return applyQuery(Array.from(this.map.values()), query)
  }

  async removeById(reportId: string): Promise<boolean> {
    return this.map.delete(reportId)
  }
}

export function applyQuery(reports: ReflectionReport[], query: ReflectionQuery): ReflectionReport[] {
  let results = reports
  if (query.executionId !== undefined) results = results.filter(r => r.executionId === query.executionId)
  if (query.category !== undefined) results = results.filter(r => r.findings.some(f => f.category === query.category))
  if (query.rootCauseCategory !== undefined) results = results.filter(r => r.rootCause.category === query.rootCauseCategory)
  if (query.recommendationKind !== undefined) results = results.filter(r => r.recommendations.some(rec => rec.kind === query.recommendationKind))
  if (query.minConfidence !== undefined) results = results.filter(r => r.findings.some(f => f.confidence >= query.minConfidence!))
  if (query.limit !== undefined) results = results.slice(0, query.limit)
  return results
}
