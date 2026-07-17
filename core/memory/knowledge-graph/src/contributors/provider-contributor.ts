import type { CapabilityGraphNode } from '@rohinik-org/compiler'
import type { GraphContributor, GraphContribution, GraphContributionContext } from '../graph-builder.js'

// ponytail: hardcoded default list; extend when adapters register providers dynamically
const DEFAULT_PROVIDERS = ['anthropic', 'openai', 'null-reasoning'] as const

export class ProviderNodeContributor implements GraphContributor {
  readonly contributorId = 'provider-registry'

  constructor(private readonly providerIds: readonly string[] = DEFAULT_PROVIDERS) {}

  async contribute(ctx: GraphContributionContext): Promise<GraphContribution> {
    const existingIds = new Set(ctx.existingGraph.nodes.map(n => n.nodeId))
    const now = new Date().toISOString()
    const nodes: CapabilityGraphNode[] = this.providerIds
      .map(id => ({
        nodeId: `rohinik://graph/provider/${id}`,
        nodeKind: 'PROVIDER' as const,
        name: id,
        displayName: id.charAt(0).toUpperCase() + id.slice(1),
        tags: ['provider'],
        metadata: {},
        addedAt: now,
      }))
      .filter(n => !existingIds.has(n.nodeId))
    return { nodes, edges: [] }
  }
}
