import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { CapabilityGraphNode, CapabilityGraphEdge } from '@rohinik-org/compiler'
import type { GraphContributor, GraphContribution, GraphContributionContext } from '../graph-builder.js'

interface PackManifest { id: string; version?: string; name?: string; type?: string; contents?: Array<{ packageId: string; version: string }> }

export class PackageContributor implements GraphContributor {
  readonly contributorId = 'package-manifest'
  async contribute(ctx: GraphContributionContext): Promise<GraphContribution> {
    const manifestPath = join(ctx.projectRoot, 'rohinik-package.json')
    if (!existsSync(manifestPath)) return { nodes: [], edges: [] }
    let manifest: PackManifest
    try { manifest = JSON.parse(await readFile(manifestPath, 'utf-8')) as PackManifest } catch { return { nodes: [], edges: [] } }
    if (manifest.type !== 'pack') return { nodes: [], edges: [] }
    const existingIds = new Set(ctx.existingGraph.nodes.map(n => n.nodeId))
    const now = new Date().toISOString()
    const nodes: CapabilityGraphNode[] = []
    const edges: CapabilityGraphEdge[] = []
    const packId = `rohinik://graph/pack/${manifest.id.replace('@', '').replace('/', '-')}`
    if (!existingIds.has(packId)) {
      nodes.push({ nodeId: packId, nodeKind: 'PACK', name: manifest.id, displayName: manifest.name ?? manifest.id, ...(manifest.version !== undefined ? { version: manifest.version } : {}), tags: ['pack'], metadata: {}, addedAt: now })
    }
    for (const content of manifest.contents ?? []) {
      edges.push({ edgeId: randomUUID(), source: packId, target: content.packageId, relationship: 'DEPENDS_ON', certainty: 'DECLARED', confidence: 1.0, required: true, provenance: 'package-manifest', provenanceDetail: `Pack contents: ${content.packageId}@${content.version}`, addedAt: now })
    }
    return { nodes, edges }
  }
}
