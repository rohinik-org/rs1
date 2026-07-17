import type { CorpusQueryEngine } from '@rohinik-org/corpus'
import type { GraphContributor, GraphContribution, GraphContributionContext } from '../graph-builder.js'
import { LearningEngine } from '../learning/learning-engine.js'
import { AutoApprovalPolicy } from '../learning/review-policy.js'
import { PromotionPipeline } from '../learning/promotion-pipeline.js'
import { InferenceStore } from '../learning/inference-store.js'
import { RepeatedDependencyRule } from '../learning/rules/repeated-dependency-rule.js'
import { CoOccurrenceRule } from '../learning/rules/co-occurrence-rule.js'
import { ToolSequenceRule } from '../learning/rules/tool-sequence-rule.js'

interface Options { minExecutions?: number; minConfidence?: number }

export class ExecutionContributor implements GraphContributor {
  readonly contributorId = 'execution-corpus'
  private readonly engine: LearningEngine
  private readonly pipeline: PromotionPipeline

  constructor(
    private readonly corpus: CorpusQueryEngine,
    opts: Options = {},
  ) {
    const { minExecutions = 10, minConfidence = 0.7 } = opts
    this.engine = new LearningEngine([
      new RepeatedDependencyRule({ minExecutions, minConfidence }),
      new CoOccurrenceRule({ minCoOccurrences: minExecutions, minConfidence }),
      new ToolSequenceRule({ minSequences: minExecutions, minConfidence }),
    ])
    this.pipeline = new PromotionPipeline(new AutoApprovalPolicy(minConfidence))
  }

  async contribute(ctx: GraphContributionContext): Promise<GraphContribution> {
    const store = new InferenceStore(ctx.projectRoot)
    const inferenceSet = await this.engine.analyze(this.corpus)

    // Persist the InferenceSet before promotion — immutable artifact first
    await store.writeSet(inferenceSet).catch(() => { /* non-fatal */ })

    if (inferenceSet.candidates.length === 0) return { nodes: [], edges: [] }

    const revisionBefore = ctx.existingGraph.revision
    // ponytail: graphRevisionAfter is estimated; actual revision depends on merge dedup in GraphStore
    const promotion = await this.pipeline.promote(inferenceSet, revisionBefore, revisionBefore + 1)

    // Persist the promotion record
    await store.writePromotion(promotion).catch(() => { /* non-fatal */ })

    return { nodes: [], edges: [...promotion.promotedEdges] }
  }
}
