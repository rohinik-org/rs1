import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { MemoryArtifact, MemoryQuery } from '@rohinik-org/compiler'
import type { MemoryStore } from './memory-store.js'

export class JsonMemoryStore implements MemoryStore {
  private readonly dir: string

  constructor(projectRoot: string) {
    this.dir = join(projectRoot, '.aios', 'memory', 'artifacts')
  }

  private async _ensureDir(): Promise<void> {
    if (!existsSync(this.dir)) await mkdir(this.dir, { recursive: true })
  }

  async saveArtifact(artifact: MemoryArtifact): Promise<void> {
    await this._ensureDir()
    await writeFile(join(this.dir, `${artifact.artifactId}.json`), JSON.stringify(artifact, null, 2), 'utf-8')
  }

  async getAll(): Promise<MemoryArtifact[]> {
    if (!existsSync(this.dir)) return []
    const files = (await readdir(this.dir)).filter(f => f.endsWith('.json'))
    const artifacts: MemoryArtifact[] = []
    for (const f of files) {
      try {
        artifacts.push(JSON.parse(await readFile(join(this.dir, f), 'utf-8')) as MemoryArtifact)
      } catch { /* skip corrupt */ }
    }
    return artifacts
  }

  async findRelevant(query: MemoryQuery): Promise<MemoryArtifact[]> {
    let results = await this.getAll()
    if (query.kinds?.length) {
      results = results.filter(a => query.kinds!.includes(a.artifactKind))
    }
    if (query.minImportance !== undefined) {
      results = results.filter(a => a.importanceScore >= query.minImportance!)
    }
    if (query.limit !== undefined) {
      results = results.slice(0, query.limit)
    }
    return results
  }

  async removeById(artifactId: string): Promise<boolean> {
    const path = join(this.dir, `${artifactId}.json`)
    if (!existsSync(path)) return false
    const { unlink } = await import('node:fs/promises')
    await unlink(path)
    return true
  }
}
