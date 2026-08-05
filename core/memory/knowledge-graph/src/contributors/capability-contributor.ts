import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { CapabilityGraphNode, CapabilityGraphEdge, CapabilityCatalogSnapshot, InstalledCapabilityEntry } from '@rohinik-org/compiler'
import type { GraphContributor, GraphContribution, GraphContributionContext } from '../graph-builder.js'

export class CapabilityContributor implements GraphContributor {
  readonly contributorId = 'capability-compiler'
  async contribute(ctx: GraphContributionContext): Promise<GraphContribution> {
    const catPath = join(ctx.projectRoot, '.aios', 'catalog.json')
    if (!existsSync(catPath)) return { nodes: [], edges: [] }
    let catalog: CapabilityCatalogSnapshot
    try { catalog = JSON.parse(await readFile(catPath, 'utf-8')) as CapabilityCatalogSnapshot } catch { return { nodes: [], edges: [] } }
    const existingIds = new Set(ctx.existingGraph.nodes.map((n: CapabilityGraphNode) => n.nodeId))
    const now = new Date().toISOString()
    const nodes: CapabilityGraphNode[] = []
    const edges: CapabilityGraphEdge[] = []
    for (const entry of catalog.entries.filter((e: InstalledCapabilityEntry) => e.status === 'enabled')) {
      const nodeId = `rohinik://graph/capability/${entry.id.replace('@', '').replace('/', '-')}`
      if (!existingIds.has(nodeId)) {
        nodes.push({ nodeId, nodeKind: 'CAPABILITY', name: entry.id, displayName: entry.id, version: entry.version, sourceId: entry.id, tags: [entry.protocol], metadata: {}, addedAt: now })
      }
      if (entry.protocol.startsWith('asset:')) {
        edges.push({ edgeId: randomUUID(), source: nodeId, target: `rohinik://graph/semantic-asset/${entry.id.replace('@', '').replace('/', '-')}`, relationship: 'GENERATED_FROM', certainty: 'DECLARED', confidence: 1.0, required: false, provenance: 'capability-compiler', addedAt: now })
      }
    }
    return { nodes, edges }
  }
}
