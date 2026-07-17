import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { CommandResolution, CommandCondition } from '../../types/command-ir.js'

interface HostResource { id: string; name: string; healthStatus: string; version?: string }

export interface HostResolverResult {
  resolution: CommandResolution
  conditions: readonly CommandCondition[]
  confirmation: 'REQUIRED' | 'OPTIONAL' | 'NONE'
}

export class HostResolver {
  constructor(private readonly projectRoot: string) {}

  async resolve(target: string): Promise<HostResolverResult | null> {
    const path = join(this.projectRoot, '.aios', 'host-inventory.json')
    if (!existsSync(path)) return null
    try {
      const raw = await readFile(path, 'utf-8')
      const inv = JSON.parse(raw) as { resources: HostResource[] }
      const t = target.toLowerCase()
      const resource = inv.resources.find(r => r.name.toLowerCase() === t || r.id.toLowerCase().includes(t))
      if (!resource) return null
      const ver = resource.version ? ` ${resource.version}` : ''
      return {
        resolution: { source: 'host', resolvedId: resource.id, explanation: `${resource.name}${ver} found on host (${resource.healthStatus})` },
        conditions: ['IF_NOT_REGISTERED'],
        confirmation: 'OPTIONAL',
      }
    } catch { return null }
  }
}
