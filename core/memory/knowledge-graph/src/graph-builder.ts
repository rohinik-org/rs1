import type { CapabilityGraph, CapabilityGraphNode, CapabilityGraphEdge } from '@rohinik-org/compiler'
import { GraphStore } from './graph-store.js'

export interface GraphContribution { readonly nodes: readonly CapabilityGraphNode[]; readonly edges: readonly CapabilityGraphEdge[] }
export interface GraphContributionContext { readonly projectRoot: string; readonly existingGraph: CapabilityGraph }
export interface GraphContributor { readonly contributorId: string; contribute(context: GraphContributionContext): Promise<GraphContribution> }

export class GraphBuilder {
  private readonly contributors: GraphContributor[] = []
  constructor(private readonly store: GraphStore) {}
  register(contributor: GraphContributor): void { this.contributors.push(contributor) }
  async build(context: GraphContributionContext): Promise<CapabilityGraph> {
    let graph = context.existingGraph
    for (const contributor of this.contributors) {
      try {
        const contribution = await contributor.contribute({ ...context, existingGraph: graph })
        graph = this.store.merge(graph, contribution.nodes, contribution.edges)
      } catch { /* non-fatal */ }
    }
    return graph
  }
  async rebuild(projectRoot: string): Promise<CapabilityGraph> {
    return this.build({ projectRoot, existingGraph: this.store.empty() })
  }
}
