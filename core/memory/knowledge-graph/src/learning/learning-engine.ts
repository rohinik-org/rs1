import { randomUUID } from 'node:crypto'
import type { InferenceSet, InferenceCandidate } from '@rohinik-org/compiler'
import type { CorpusQueryEngine } from '@rohinik-org/corpus'
import type { InferenceRule } from './inference-rule.js'

export class LearningEngine {
  constructor(private readonly rules: readonly InferenceRule[]) {}

  async analyze(
    corpus: CorpusQueryEngine,
    window?: { start: string; end: string },
  ): Promise<InferenceSet> {
    const allCandidates: InferenceCandidate[] = []
    for (const rule of this.rules) {
      try {
        const results = await rule.infer(corpus, window)
        allCandidates.push(...results)
      } catch (err) {
        console.warn(`[aios:learning] InferenceRule ${rule.ruleId} failed:`, err)
      }
    }

    // De-duplicate by stableEdgeId; keep the candidate with highest confidence
    const best = new Map<string, InferenceCandidate>()
    for (const c of allCandidates) {
      const existing = best.get(c.stableEdgeId)
      if (!existing || c.confidence > existing.confidence) best.set(c.stableEdgeId, c)
    }

    const now = new Date().toISOString()
    return {
      kind: 'InferenceSet',
      schemaVersion: '1.0',
      inferenceSetId: randomUUID(),
      producedAt: now,
      corpusWindow: window ?? { start: '2000-01-01', end: now },
      candidates: [...best.values()],
    }
  }
}
