import type { CertificationReport, CertificationQuery } from '@rohinik-org/compiler'
import type { CertificationStore } from './certification-store.js'

export class NullCertificationStore implements CertificationStore {
  private readonly map = new Map<string, CertificationReport>()

  async save(report: CertificationReport): Promise<void> { this.map.set(report.reportId, report) }
  async get(reportId: string): Promise<CertificationReport | undefined> { return this.map.get(reportId) }
  async list(): Promise<readonly CertificationReport[]> { return Array.from(this.map.values()) }
  async search(query: CertificationQuery): Promise<readonly CertificationReport[]> {
    return applyQuery(Array.from(this.map.values()), query)
  }
  async latest(): Promise<CertificationReport | undefined> {
    const all = Array.from(this.map.values())
    return all.sort((a, b) => b.finishedAt.localeCompare(a.finishedAt))[0]
  }
}

export function applyQuery(reports: CertificationReport[], query: CertificationQuery): CertificationReport[] {
  let results = reports
  if (query.category !== undefined) results = results.filter(r => r.results.some(res => res.category === query.category))
  if (query.status !== undefined) results = results.filter(r => r.summary.overallStatus === query.status)
  if (query.limit !== undefined) results = results.slice(0, query.limit)
  return results
}
