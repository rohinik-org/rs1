import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { CapabilityGraphEdge, CapabilityCatalogSnapshot } from '@rohinik-org/compiler'
import type { GraphContributor, GraphContribution, GraphContributionContext } from '../graph-builder.js'

interface StoredSemanticMetadata {
  capabilityId: string
  requiresHost: string[]
  requiresProviders: string[]
  consumes: string[]
  produces: string[]
  implements: string[]
  recommends: string[]
}

interface CatalogEntryNotes {
  semanticMetadata?: StoredSemanticMetadata[]
}

export class SemanticContributor implements GraphContributor {
  readonly contributorId = 'semantic-compiler'

  async contribute(ctx: GraphContributionContext): Promise<GraphContribution> {
    const catPath = join(ctx.projectRoot, '.aios', 'catalog.json')
    if (!existsSync(catPath)) return { nodes: [], edges: [] }

    let catalog: CapabilityCatalogSnapshot
    try {
      catalog = JSON.parse(await readFile(catPath, 'utf-8')) as CapabilityCatalogSnapshot
    } catch { return { nodes: [], edges: [] } }

    const existingNodeIds = new Set(ctx.existingGraph.nodes.map(n => n.nodeId))
    const now = new Date().toISOString()
    const edges: CapabilityGraphEdge[] = []

    for (const entry of catalog.entries.filter(e => e.status === 'enabled')) {
      if (!entry.notes) continue
      let notes: CatalogEntryNotes
      try { notes = JSON.parse(entry.notes) as CatalogEntryNotes } catch { continue }
      const metaList = notes.semanticMetadata ?? []

      for (const meta of metaList) {
        const capNodeId = `rohinik://graph/capability/${entry.id.replace('@', '').replace('/', '-')}`

        const addEdge = (relationship: CapabilityGraphEdge['relationship'], conceptName: string) => {
          const target = `concept://${conceptName}`
          if (existingNodeIds.has(target)) {
            edges.push({ edgeId: randomUUID(), source: capNodeId, target, relationship, certainty: 'DECLARED', confidence: 1.0, required: relationship === 'REQUIRES_HOST', provenance: 'semantic-compiler', provenanceDetail: `Extracted from ${entry.id} semantic frontmatter`, addedAt: now })
          }
        }

        for (const host of meta.requiresHost) addEdge('REQUIRES_HOST', host)
        for (const c of meta.consumes) addEdge('CONSUMES', c)
        for (const p of meta.produces) addEdge('PRODUCES', p)
        for (const i of meta.implements) addEdge('IMPLEMENTS', i)
        for (const r of meta.recommends) addEdge('RECOMMENDS', r)
      }
    }

    return { nodes: [], edges }
  }
}
