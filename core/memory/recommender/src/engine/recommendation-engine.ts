import { createHash } from 'node:crypto'
import type { CapabilityGraphNode, RecommendationResult, Recommendation } from '@rohinik-org/compiler'
import type { CorpusQueryEngine } from '@rohinik-org/corpus'
import type { CapabilityGraphQuery } from '@rohinik-org/knowledge-graph'
import type { RecommendationStrategy } from '../strategies/recommendation-strategy.js'
import type { RecommendationMerger } from '../merger/recommendation-merger.js'
import type { RecommendationRanker } from '../ranking/recommendation-ranker.js'
import type { ExplanationBuilder } from '../ranking/explanation-builder.js'
import type { RecommendationPolicy } from '../policy/recommendation-policy.js'

export interface RecommendationEngineOptions {
  readonly strategies: readonly RecommendationStrategy[]
  readonly merger: RecommendationMerger
  readonly ranker: RecommendationRanker
  readonly explanationBuilder: ExplanationBuilder
  readonly store: { save(r: RecommendationResult): Promise<void>; load(id: string): Promise<RecommendationResult | null> }
  readonly policy: RecommendationPolicy
}

export class RecommendationEngine {
  constructor(private readonly opts: RecommendationEngineOptions) {}

  async recommend(
    anchors: readonly CapabilityGraphNode[],
    graphQuery: CapabilityGraphQuery,
    corpus: CorpusQueryEngine,
  ): Promise<RecommendationResult> {
    const graph = (graphQuery as unknown as { graph: import('@rohinik-org/compiler').CapabilityGraph }).graph
    const anchorIds = new Set(anchors.map(a => a.nodeId))

    // Step 1: run strategies in parallel, isolate failures
    const strategyResults = await Promise.all(
      this.opts.strategies.map(async s => {
        try {
          return await s.recommend(anchors, graphQuery, corpus)
        } catch (err) {
          console.warn(`[aios:recommender] Strategy ${s.strategyId} failed:`, err)
          return []
        }
      }),
    )

    // Step 2: merge
    const allCandidates = strategyResults.flat()
    const merged = this.opts.merger.merge(allCandidates, anchorIds)

    // Step 3: rank
    const ranked = this.opts.ranker.rank(merged, this.opts.policy)

    // Step 4: build explanations
    const recommendations: Recommendation[] = ranked.map(c => ({
      nodeId: c.nodeId,
      recommendationType: c.recommendationType,
      confidence: {
        score: c.rawScore,
        graphWeight: c.evidenceSteps.length > 0 ? c.rawScore : 0,
        corpusWeight: c.evidenceSteps.length === 0 ? c.rawScore : 0,
        policyWeight: 0,
      },
      explanation: this.opts.explanationBuilder.build(c, graphQuery),
      producedBy: c.producedBy,
    }))

    // Step 5: assemble result with deterministic ID
    const canonicalBody = {
      anchors: anchors.map(a => a.nodeId).sort(),
      generatedBy: this.opts.policy.policyId,
      graphRevision: graph.revision,
      corpusRevision: 0,
      recommendations: recommendations.map(r => ({ nodeId: r.nodeId, recommendationType: r.recommendationType })),
    }
    const recommendationId = createHash('sha256').update(JSON.stringify(canonicalBody)).digest('hex')

    const result: RecommendationResult = {
      kind: 'RecommendationResult',
      schemaVersion: '1.0',
      recommendationId,
      generatedAt: new Date().toISOString(),
      anchors: anchors.map(a => a.nodeId),
      generatedBy: this.opts.policy.policyId,
      graphRevision: graph.revision,
      corpusRevision: 0,
      recommendations,
    }

    await this.opts.store.save(result)
    return result
  }
}
