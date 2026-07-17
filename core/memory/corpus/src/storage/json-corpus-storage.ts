import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { ExecutionRecord } from '@rohinik-org/compiler'
import type { CorpusStorage } from './corpus-storage.js'

export class JsonCorpusStorage implements CorpusStorage {
  constructor(private readonly root: string) {}

  private dateDir(isoTimestamp: string): string {
    return isoTimestamp.slice(0, 10) // 'YYYY-MM-DD'
  }

  async write(record: ExecutionRecord): Promise<void> {
    const dir = join(this.root, this.dateDir(record.timestamp))
    await mkdir(dir, { recursive: true })
    await writeFile(
      join(dir, `${record.recordId}.json`),
      JSON.stringify(record),
      'utf-8',
    )
  }

  async read(recordId: string): Promise<ExecutionRecord | null> {
    if (!existsSync(this.root)) return null
    const days = await readdir(this.root).catch(() => [] as string[])
    for (const day of days) {
      const file = join(this.root, day, `${recordId}.json`)
      if (existsSync(file)) {
        const raw = await readFile(file, 'utf-8')
        return JSON.parse(raw) as ExecutionRecord
      }
    }
    return null
  }

  async *readRange(dateStart: string, dateEnd: string): AsyncIterable<ExecutionRecord> {
    if (!existsSync(this.root)) return
    const days = (await readdir(this.root).catch(() => [] as string[]))
      .filter(d => d >= dateStart && d <= dateEnd)
      .sort()
    for (const day of days) {
      const dirPath = join(this.root, day)
      const files = await readdir(dirPath).catch(() => [] as string[])
      for (const file of files) {
        if (!file.endsWith('.json')) continue
        const raw = await readFile(join(dirPath, file), 'utf-8').catch(() => null)
        if (raw) yield JSON.parse(raw) as ExecutionRecord
      }
    }
  }

  // v1 no-op: JSON file storage does not compact
  async compact(_beforeDate: string): Promise<number> {
    return 0
  }

  // v1 no-op: JSON file storage does not archive
  async archive(_beforeDate: string, _destination: string): Promise<number> {
    return 0
  }

  async close(): Promise<void> {}
}
