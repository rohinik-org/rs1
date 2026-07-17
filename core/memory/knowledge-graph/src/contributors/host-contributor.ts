import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { CapabilityGraphNode, CapabilityGraphEdge, HostInventory } from '@rohinik-org/compiler'
import type { GraphContributor, GraphContribution, GraphContributionContext } from '../graph-builder.js'

export class HostContributor implements GraphContributor {
  readonly contributorId = 'host-discovery'
  async contribute(ctx: GraphContributionContext): Promise<GraphContribution> {
    const invPath = join(ctx.projectRoot, '.aios', 'host-inventory.json')
    if (!existsSync(invPath)) return { nodes: [], edges: [] }
    let inv: HostInventory
    try { inv = JSON.parse(await readFile(invPath, 'utf-8')) as HostInventory } catch { return { nodes: [], edges: [] } }
    const existingNodeIds = new Set(ctx.existingGraph.nodes.map(n => n.nodeId))
    const now = new Date().toISOString()
    const nodes: CapabilityGraphNode[] = []
    const edges: CapabilityGraphEdge[] = []
    for (const resource of inv.resources) {
      const nodeId = `rohinik://graph/host-resource/${resource.name}`
      if (!existingNodeIds.has(nodeId)) {
        nodes.push({ nodeId, nodeKind: 'HOST_RESOURCE', name: resource.name, displayName: resource.displayName, ...(resource.version !== undefined ? { version: resource.version } : {}), sourceId: resource.id, tags: [resource.resourceType], metadata: {}, addedAt: now })
      }
      const conceptId = `concept://${resource.name}`
      const conceptExists = ctx.existingGraph.nodes.some(n => n.nodeId === conceptId) || nodes.some(n => n.nodeId === conceptId)
      if (conceptExists) {
        edges.push({ edgeId: randomUUID(), source: nodeId, target: conceptId, relationship: 'PROVIDES_RUNTIME', certainty: 'OBSERVED', confidence: 1.0, required: false, provenance: 'host-discovery', ...(resource.executablePath !== undefined ? { provenanceDetail: `Detected on host: ${resource.executablePath}` } : {}), addedAt: now })
      }
    }
    return { nodes, edges }
  }
}
