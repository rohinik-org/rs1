import { mkdir, readdir, readFile, writeFile, unlink } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { ReflectionReport, ReflectionQuery } from '@rohinik-org/compiler'
import type { ReflectionStore } from './reflection-store.js'
import { applyQuery } from './null-reflection-store.js'

export class JsonReflectionStore implements ReflectionStore {
  private readonly dir: string

  constructor(projectRoot: string) {
    this.dir = join(projectRoot, '.aios', 'reflection')
  }

  private async _ensureDir(): Promise<void> {
    if (!existsSync(this.dir)) await mkdir(this.dir, { recursive: true })
  }

  async save(report: ReflectionReport): Promise<void> {
    await this._ensureDir()
    await writeFile(join(this.dir, `${report.reportId}.json`), JSON.stringify(report, null, 2), 'utf-8')
  }

  async get(reportId: string): Promise<ReflectionReport | undefined> {
    const path = join(this.dir, `${reportId}.json`)
    if (!existsSync(path)) return undefined
    try {
      return JSON.parse(await readFile(path, 'utf-8')) as ReflectionReport
    } catch { return undefined }
  }

  async list(): Promise<readonly ReflectionReport[]> {
    if (!existsSync(this.dir)) return []
    const files = (await readdir(this.dir)).filter(f => f.endsWith('.json'))
    const reports: ReflectionReport[] = []
    for (const f of files) {
      try {
        reports.push(JSON.parse(await readFile(join(this.dir, f), 'utf-8')) as ReflectionReport)
      } catch { /* skip corrupt */ }
    }
    return reports
  }

  async latest(): Promise<ReflectionReport | undefined> {
    const all = await this.list() as ReflectionReport[]
    return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  }

  async search(query: ReflectionQuery): Promise<readonly ReflectionReport[]> {
    return applyQuery(await this.list() as ReflectionReport[], query)
  }

  async removeById(reportId: string): Promise<boolean> {
    const path = join(this.dir, `${reportId}.json`)
    if (!existsSync(path)) return false
    await unlink(path)
    return true
  }
}
