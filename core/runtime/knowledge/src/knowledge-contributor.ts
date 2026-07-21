import type { KnowledgeRegistry } from './knowledge-registry.js'
import type { KnowledgeRelationship } from './knowledge-ir.js'

// GraphContributor interface from @rohinik-org/knowledge-graph
// Duplicated here to avoid circular dep — knowledge-graph depends on compiler types
export interface GraphContribution {
  readonly nodes: readonly GraphContributorNode[]
  readonly edges: readonly GraphContributorEdge[]
}

export interface GraphContributionContext {
  readonly projectRoot: string
  readonly existingGraph: unknown
}

export interface GraphContributorNode {
  readonly nodeId: string
  readonly nodeKind: string
  readonly name: string
  readonly displayName: string
  readonly tags: readonly string[]
  readonly metadata: Record<string, unknown>
  readonly addedAt: string
}

export interface GraphContributorEdge {
  readonly edgeId: string
  readonly source: string
  readonly target: string
  readonly relationship: string
  readonly certainty: string
  readonly confidence: number
  readonly required: boolean
  readonly provenance: string
  readonly addedAt: string
}

export class KnowledgeContributor {
  readonly contributorId = 'knowledge-contributor'

  constructor(private readonly registry: KnowledgeRegistry) {}

  async contribute(_context: GraphContributionContext): Promise<GraphContribution> {
    const nodes: GraphContributorNode[] = []
    const edges: GraphContributorEdge[] = []
    const now = new Date().toISOString()

    for (const fragment of this.registry.list()) {
      for (const node of [...fragment.nodes, ...fragment.procedures]) {
        nodes.push({
          nodeId: `knowledge://${node.primitive.toLowerCase()}/${node.id}`,
          nodeKind: node.primitive === 'Entity' ? 'CAPABILITY' : 'CONCEPT',
          name: node.id,
          displayName: node.label,
          tags: [],
          metadata: { primitive: node.primitive, kind: node.kind ?? null, certainty: node.certainty },
          addedAt: now,
        })
      }
      for (const edge of fragment.edges) {
        edges.push({
          edgeId: edge.id,
          source: `knowledge://entity/${edge.sourceNodeId}`,
          target: `knowledge://entity/${edge.targetNodeId}`,
          relationship: _graphRelationship(edge.relationship),
          certainty: edge.certainty === 1.0 ? 'DECLARED' : 'INFERRED',
          confidence: edge.certainty,
          required: false,
          provenance: 'execution-corpus',
          addedAt: now,
        })
      }
    }
    return { nodes, edges }
  }
}

function _graphRelationship(r: KnowledgeRelationship): string {
  // Map knowledge relationships to CapabilityGraph relationships where overlap exists
  const map: Record<string, string> = {
    DEPENDS_ON: 'DEPENDS_ON',
    IMPLEMENTS: 'IMPLEMENTS',
    PRODUCES: 'PRODUCES',
    GENERATES: 'GENERATED_FROM',
  }
  return map[r] ?? 'DEPENDS_ON'
}
