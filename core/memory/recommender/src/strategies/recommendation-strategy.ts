import type { CapabilityGraphNode, ExplanationStep, RecommendationType } from '@rohinik-org/compiler'
import type { CorpusQueryEngine } from '@rohinik-org/corpus'
import type { CapabilityGraphQuery } from '@rohinik-org/knowledge-graph'

export interface RecommendationCandidate {
  readonly nodeId: string
  readonly recommendationType: RecommendationType
  readonly rawScore: number                           // 0–1, strategy-local
  readonly evidenceSteps: readonly ExplanationStep[]  // direction-tagged
  readonly producedBy: readonly string[]              // strategyIds
}

export interface RecommendationStrategy {
  readonly strategyId: string
  readonly recommendationTypes: readonly RecommendationType[]
  recommend(
    anchors: readonly CapabilityGraphNode[],
    graphQuery: CapabilityGraphQuery,
    corpus: CorpusQueryEngine,
  ): Promise<readonly RecommendationCandidate[]>
}
