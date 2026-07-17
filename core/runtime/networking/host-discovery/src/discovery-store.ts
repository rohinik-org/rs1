import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { HostInventory } from '@rohinik-org/compiler'

export class DiscoveryStore {
  private readonly path: string

  constructor(root: string) {
    this.path = join(root, '.aios', 'host-inventory.json')
  }

  async read(): Promise<HostInventory | null> {
    if (!existsSync(this.path)) return null
    const raw = await readFile(this.path, 'utf-8').catch(() => null)
    if (!raw) return null
    return JSON.parse(raw) as HostInventory
  }

  async write(inventory: HostInventory): Promise<void> {
    await mkdir(join(this.path, '..'), { recursive: true })
    await writeFile(this.path, JSON.stringify(inventory, null, 2), 'utf-8')
    // Enrich capability graph (non-fatal — fire and forget)
    void this.enrichGraph().catch(() => { /* non-fatal */ })
  }

  isStale(inventory: HostInventory, maxAgeHours = 24): boolean {
    const age = Date.now() - new Date(inventory.lastUpdatedAt).getTime()
    return age > maxAgeHours * 3_600_000
  }

  private async enrichGraph(): Promise<void> {
    try {
      const root = join(this.path, '..', '..')
      const { createRequire } = await import('node:module')
      const { resolve } = await import('node:path')
      const { existsSync } = await import('node:fs')
      const { pathToFileURL } = await import('node:url')
      let mod: unknown = null
      for (const base of [process.cwd()]) {
        try { mod = await import(createRequire(base + '/package.json').resolve('@rohinik-org/knowledge-graph')); break } catch { /* continue */ }
      }
      if (!mod) {
        const candidate = resolve(process.cwd(), 'packages/knowledge-graph/dist/index.js')
        if (existsSync(candidate)) mod = await import(pathToFileURL(candidate).href)
      }
      if (!mod || typeof mod !== 'object' || !('GraphStore' in mod) || !('GraphBuilder' in mod) || !('HostContributor' in mod)) return
      const m = mod as Record<string, new (...args: unknown[]) => unknown>
      const store = new m['GraphStore']!(root)
      const builder = new m['GraphBuilder']!(store)
      builder.register(new m['HostContributor']!())
      const existing = await (store as { read(): Promise<unknown> }).read()
      const updated = await (builder as { build(ctx: unknown): Promise<unknown> }).build({ projectRoot: root, existingGraph: existing })
      await (store as { write(g: unknown): Promise<void> }).write(updated)
    } catch { /* non-fatal */ }
  }
}
