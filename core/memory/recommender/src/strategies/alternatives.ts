import type { CapabilityGraphNode } from '@rohinik-org/compiler'
import type { CorpusQueryEngine } from '@rohinik-org/corpus'
import type { CapabilityGraphQuery } from '@rohinik-org/knowledge-graph'
import type { RecommendationCandidate, RecommendationStrategy } from './recommendation-strategy.js'

export class AlternativeStrategy implements RecommendationStrategy {
  readonly strategyId = 'AlternativeStrategy'
  readonly recommendationTypes = ['ALTERNATIVE'] as const

  async recommend(
    anchors: readonly CapabilityGraphNode[],
    graphQuery: CapabilityGraphQuery,
    _corpus: CorpusQueryEngine,
  ): Promise<readonly RecommendationCandidate[]> {
    const anchorIds = new Set(anchors.map(a => a.nodeId))
    const graph = (graphQuery as unknown as { graph: import('@rohinik-org/compiler').CapabilityGraph }).graph
    const candidates: RecommendationCandidate[] = []

    for (const anchor of anchors) {
      const altEdges = graph.edges.filter(
        e => e.source === anchor.nodeId && e.relationship === 'ALTERNATIVE_TO',
      )
      for (const e of altEdges) {
        if (anchorIds.has(e.target)) continue
        candidates.push({
          nodeId: e.target,
          recommendationType: 'ALTERNATIVE',
          rawScore: 0.8,
          evidenceSteps: [{ fromNodeId: anchor.nodeId, relationship: 'ALTERNATIVE_TO', toNodeId: e.target, certainty: e.certainty, direction: 'OUTGOING' }],
          producedBy: [this.strategyId],
        })
      }
    }
    return candidates
  }
}
