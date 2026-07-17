import { randomUUID } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { CapabilityCandidate, CapabilityQuery } from '@rohinik-org/compiler'
import type { CapabilitySource } from './capability-source.js'

interface PluginManifest {
  name?: string
  description?: string
  version?: string
  tags?: string[]
}

export class LocalPluginSource implements CapabilitySource {
  readonly sourceId = 'local'

  constructor(private readonly projectRoot: string) {}

  async discover(query: CapabilityQuery): Promise<CapabilityCandidate[]> {
    const pluginsDir = join(this.projectRoot, '.aios', 'plugins')
    let entries: string[]
    try {
      entries = await readdir(pluginsDir)
    } catch {
      return []
    }

    const candidates: CapabilityCandidate[] = []
    for (const entry of entries) {
      const manifestPath = join(pluginsDir, entry, 'aios-plugin.json')
      try {
        const raw = await readFile(manifestPath, 'utf-8')
        const manifest = JSON.parse(raw) as PluginManifest
        if (!manifest.name?.trim()) continue
        candidates.push({
          kind: 'CapabilityCandidate',
          candidateId: randomUUID(),
          queryId: query.queryId,
          sourceId: this.sourceId,
          name: manifest.name,
          description: manifest.description ?? '',
          tags: manifest.tags ?? [],
          installSource: { scheme: 'file', location: join(pluginsDir, entry) },
          confidence: 1.0,
          producedAt: new Date().toISOString(),
        })
      } catch {
        // skip dirs without valid manifest
      }
    }
    return candidates
  }
}
