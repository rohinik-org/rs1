import type { CapabilityGraphNode } from '@rohinik-org/compiler'
import type { CorpusQueryEngine } from '@rohinik-org/corpus'
import type { CapabilityGraphQuery } from '@rohinik-org/knowledge-graph'
import type { RecommendationCandidate, RecommendationStrategy } from './recommendation-strategy.js'

export class CompanionToolStrategy implements RecommendationStrategy {
  readonly strategyId = 'CompanionToolStrategy'
  readonly recommendationTypes = ['COMPANION_TOOL'] as const

  async recommend(
    anchors: readonly CapabilityGraphNode[],
    graphQuery: CapabilityGraphQuery,
    _corpus: CorpusQueryEngine,
  ): Promise<readonly RecommendationCandidate[]> {
    const anchorIds = new Set(anchors.map(a => a.nodeId))
    const graph = (graphQuery as unknown as { graph: import('@rohinik-org/compiler').CapabilityGraph }).graph
    const candidates: RecommendationCandidate[] = []

    for (const anchor of anchors) {
      const recEdges = graph.edges.filter(
        e => e.source === anchor.nodeId && e.relationship === 'RECOMMENDS',
      )
      for (const e of recEdges) {
        if (anchorIds.has(e.target)) continue
        candidates.push({
          nodeId: e.target,
          recommendationType: 'COMPANION_TOOL',
          rawScore: 0.75,
          evidenceSteps: [{ fromNodeId: anchor.nodeId, relationship: 'RECOMMENDS', toNodeId: e.target, certainty: e.certainty, direction: 'OUTGOING' }],
          producedBy: [this.strategyId],
        })
      }
    }
    return candidates
  }
}
