import { randomUUID } from 'node:crypto'
import type { ExecutionResult, MemoryArtifact, MemoryPolicyConfig, MemoryQuery, MemoryResult } from '@rohinik-org/compiler'
import type { MemoryStore } from '../store/memory-store.js'
import { EpisodicRecorder } from '../episodic/episodic-recorder.js'
import { SemanticExtractor } from '../semantic/semantic-extractor.js'
import { ProceduralLearner } from '../procedural/procedural-learner.js'
import { MemoryPolicy } from '../policy/memory-policy.js'
import { ConsolidationEngine } from '../consolidation/consolidation-engine.js'
import { RetrievalEngine } from '../retrieval/retrieval-engine.js'
import { MemoryRanker } from '../ranking/memory-ranker.js'

export class MemoryEngine {
  private readonly episodicRecorder: EpisodicRecorder
  private readonly semanticExtractor = new SemanticExtractor()
  private readonly proceduralLearner = new ProceduralLearner()
  private readonly policy: MemoryPolicy
  private readonly consolidation: ConsolidationEngine
  private readonly retrieval: RetrievalEngine

  constructor(store: MemoryStore, policyConfig: MemoryPolicyConfig) {
    this.policy = new MemoryPolicy(policyConfig)
    this.episodicRecorder = new EpisodicRecorder(store)
    this.consolidation = new ConsolidationEngine(this.policy, store)
    this.retrieval = new RetrievalEngine(store, new MemoryRanker())
  }

  async record(result: ExecutionResult): Promise<MemoryArtifact[]> {
    const episode = await this.episodicRecorder.record(result)
    const semanticCandidates = this.semanticExtractor.extract(result)
    const proceduralCandidates = this.proceduralLearner.learn(result)

    return this.consolidation.consolidate({
      kind: 'MemoryCandidateSet',
      setId: randomUUID(),
      executionId: result.executionId,
      candidates: [
        {
          candidateId: episode.episodeId,
          kind: 'EPISODIC',
          sourceExecutionId: result.executionId,
          evidence: episode as unknown as Record<string, unknown>,
          confidence: 1.0,
          producedAt: episode.recordedAt,
        },
        ...semanticCandidates,
        ...proceduralCandidates,
      ],
      producedAt: new Date().toISOString(),
    })
  }

  async recall(query: MemoryQuery): Promise<MemoryResult[]> {
    return this.retrieval.recall(query)
  }
}
