import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { ReasoningReport, ReasoningQuery } from '@rohinik-org/compiler'
import type { ReasoningStore } from './reasoning-store.js'
import { applyQuery } from './null-reasoning-store.js'

export class JsonReasoningStore implements ReasoningStore {
  constructor(private readonly projectRoot = '.rohinik') {}

  private _dir(): string { return join(this.projectRoot, 'reasoning') }
  private _file(id: string): string { return join(this._dir(), `${id}.json`) }

  private _ensureDir(): void {
    if (!existsSync(this._dir())) mkdirSync(this._dir(), { recursive: true })
  }

  async save(report: ReasoningReport): Promise<void> {
    this._ensureDir()
    writeFileSync(this._file(report.reportId), JSON.stringify(report, null, 2), 'utf8')
  }

  async get(reportId: string): Promise<ReasoningReport | undefined> {
    try { return JSON.parse(readFileSync(this._file(reportId), 'utf8')) as ReasoningReport } catch { return undefined }
  }

  async list(): Promise<readonly ReasoningReport[]> {
    return this._readAll()
  }

  async latest(): Promise<ReasoningReport | undefined> {
    return this._readAll().sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))[0]
  }

  async search(query: ReasoningQuery): Promise<readonly ReasoningReport[]> {
    return applyQuery(this._readAll(), query)
  }

  async removeById(reportId: string): Promise<boolean> {
    try { unlinkSync(this._file(reportId)); return true } catch { return false }
  }

  private _readAll(): ReasoningReport[] {
    if (!existsSync(this._dir())) return []
    const reports: ReasoningReport[] = []
    for (const f of readdirSync(this._dir())) {
      if (!f.endsWith('.json')) continue
      try { reports.push(JSON.parse(readFileSync(join(this._dir(), f), 'utf8')) as ReasoningReport) } catch { /* skip corrupt */ }
    }
    return reports
  }
}
