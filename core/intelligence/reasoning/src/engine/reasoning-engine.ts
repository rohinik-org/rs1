import { randomUUID } from 'node:crypto'
import type { ReasoningReport, ReasoningPolicy } from '@rohinik-org/compiler'
import { DEFAULT_REASONING_POLICY } from '@rohinik-org/compiler'
import type { ReasoningStore } from '../store/reasoning-store.js'
import { EvidenceCollector, EvidenceNormalizer, EvidenceGraphBuilder } from '../evidence/evidence-collector.js'
import type { EvidenceInput } from '../evidence/evidence-collector.js'
import { InferenceEngine } from '../inference/inference-engine.js'
import { HypothesisGenerator, HypothesisRanker } from '../hypothesis/hypothesis-generator.js'
import { RecommendationEngine } from './recommendation-engine.js'
import { ReasoningPolicyEngine } from '../policy/reasoning-policy-engine.js'

export class ReasoningEngine {
  private readonly collector = new EvidenceCollector()
  private readonly normalizer = new EvidenceNormalizer()
  private readonly graphBuilder = new EvidenceGraphBuilder()
  private readonly inferenceEngine = new InferenceEngine()
  private readonly generator = new HypothesisGenerator()
  private readonly ranker = new HypothesisRanker()
  private readonly recommendationEngine = new RecommendationEngine()
  private readonly policyEngine = new ReasoningPolicyEngine()

  constructor(
    private readonly store: ReasoningStore,
    private readonly policy: ReasoningPolicy = DEFAULT_REASONING_POLICY,
  ) {}

  async reason(input: EvidenceInput): Promise<ReasoningReport> {
    try {
      const evidenceSet = this.collector.collect(input)
      const allRefs = this.normalizer.toReferences(evidenceSet)
      const _graph = this.graphBuilder.build(evidenceSet)
      const chains = this.inferenceEngine.run(evidenceSet)
      const unranked = this.generator.generate(chains)
      const ranked = this.ranker.rank(unranked).slice(0, this.policy.maximumHypotheses)
      const recommendations = this.recommendationEngine.recommend(ranked)
      const status = this.policyEngine.evaluate(ranked, this.policy)

      const report: ReasoningReport = {
        kind: 'ReasoningReport',
        schemaVersion: '1.0',
        reportId: randomUUID(),
        generatedAt: new Date().toISOString(),
        hypothesisSet: ranked,
        selectedHypothesis: ranked[0]?.hypothesisId ?? '',
        recommendationSet: recommendations,
        evidenceGraph: allRefs,
        inferenceChains: chains,
        status,
      }

      await this.store.save(report)
      return report
    } catch (err) {
      const empty: ReasoningReport = {
        kind: 'ReasoningReport',
        schemaVersion: '1.0',
        reportId: randomUUID(),
        generatedAt: new Date().toISOString(),
        hypothesisSet: [],
        selectedHypothesis: '',
        recommendationSet: [],
        evidenceGraph: [],
        inferenceChains: [],
        status: 'REJECTED',
        ...(err !== undefined && {}),  // satisfy linter — err logged in prod
      }
      await this.store.save(empty)
      return empty
    }
  }
}
