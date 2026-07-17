import type { CapabilityGraphNode } from '@rohinik-org/compiler'
import type { CorpusQueryEngine } from '@rohinik-org/corpus'
import type { CapabilityGraphQuery } from '@rohinik-org/knowledge-graph'
import type { RecommendationCandidate, RecommendationStrategy } from './recommendation-strategy.js'

export class CorpusFrequencyStrategy implements RecommendationStrategy {
  readonly strategyId = 'CorpusFrequencyStrategy'
  readonly recommendationTypes = ['RELATED_CAPABILITY'] as const

  async recommend(
    anchors: readonly CapabilityGraphNode[],
    _graphQuery: CapabilityGraphQuery,
    corpus: CorpusQueryEngine,
  ): Promise<readonly RecommendationCandidate[]> {
    const anchorIds = new Set(anchors.map(a => a.nodeId))
    const stats = await corpus.stats({})
    if (stats.total === 0) return []

    const maxCount = stats.topSkills[0]?.count ?? 1
    const candidates: RecommendationCandidate[] = []

    for (const { skillId, count } of stats.topSkills) {
      if (anchorIds.has(skillId)) continue
      candidates.push({
        nodeId: skillId,
        recommendationType: 'RELATED_CAPABILITY',
        rawScore: count / maxCount,
        evidenceSteps: [],
        producedBy: [this.strategyId],
      })
    }
    return candidates
  }
}
