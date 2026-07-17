import type { CapabilityGraphNode } from '@rohinik-org/compiler'
import type { CorpusQueryEngine } from '@rohinik-org/corpus'
import type { CapabilityGraphQuery } from '@rohinik-org/knowledge-graph'
import type { RecommendationCandidate, RecommendationStrategy } from './recommendation-strategy.js'

// Finds nodes that share a CONSUMES/PRODUCES concept with any anchor.
// Traversal bounded to 1 hop (anchor → concept → sibling).
export class GraphExpansionStrategy implements RecommendationStrategy {
  readonly strategyId = 'GraphExpansionStrategy'
  readonly recommendationTypes = ['RELATED_CAPABILITY'] as const

  async recommend(
    anchors: readonly CapabilityGraphNode[],
    graphQuery: CapabilityGraphQuery,
    _corpus: CorpusQueryEngine,
  ): Promise<readonly RecommendationCandidate[]> {
    const anchorIds = new Set(anchors.map(a => a.nodeId))
    const candidates = new Map<string, RecommendationCandidate>()

    for (const anchor of anchors) {
      const graph = (graphQuery as unknown as { graph: import('@rohinik-org/compiler').CapabilityGraph }).graph
      const outEdges = graph.edges.filter(
        e => e.source === anchor.nodeId && (e.relationship === 'PRODUCES' || e.relationship === 'CONSUMES'),
      )

      for (const outEdge of outEdges) {
        const conceptId = outEdge.target
        const siblingEdges = graph.edges.filter(
          e => e.target === conceptId && (e.relationship === 'PRODUCES' || e.relationship === 'CONSUMES') && e.source !== anchor.nodeId,
        )
        for (const sibEdge of siblingEdges) {
          if (anchorIds.has(sibEdge.source)) continue
          if (!candidates.has(sibEdge.source)) {
            candidates.set(sibEdge.source, {
              nodeId: sibEdge.source,
              recommendationType: 'RELATED_CAPABILITY',
              rawScore: 0.7,
              evidenceSteps: [
                { fromNodeId: anchor.nodeId, relationship: outEdge.relationship, toNodeId: conceptId, certainty: outEdge.certainty, direction: 'OUTGOING' },
                { fromNodeId: sibEdge.source, relationship: sibEdge.relationship, toNodeId: conceptId, certainty: sibEdge.certainty, direction: sibEdge.relationship === 'PRODUCES' ? 'OUTGOING' : 'INCOMING' },
              ],
              producedBy: [this.strategyId],
            })
          }
        }
      }
    }
    return [...candidates.values()]
  }
}
