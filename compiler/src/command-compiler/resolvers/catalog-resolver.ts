import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { CommandResolution } from '../../types/command-ir.js'

interface CatalogEntry { id: string; registeredCapabilityIds: string[]; status: string }

export class CatalogResolver {
  constructor(private readonly projectRoot: string) {}

  async resolve(target: string): Promise<CommandResolution | null> {
    const path = join(this.projectRoot, '.aios', 'catalog.json')
    if (!existsSync(path)) return null
    try {
      const raw = await readFile(path, 'utf-8')
      const catalog = JSON.parse(raw) as { entries: CatalogEntry[] }
      const t = target.toLowerCase()
      const entry = catalog.entries.find(e =>
        e.id.toLowerCase().includes(t) ||
        e.registeredCapabilityIds.some(s => s.toLowerCase().includes(t))
      )
      if (!entry || entry.status !== 'enabled') return null
      return { source: 'catalog', resolvedId: entry.id, explanation: `Found "${target}" in catalog as ${entry.id} (enabled)` }
    } catch { return null }
  }
}
