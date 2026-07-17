import type { ExplanationPath } from '@rohinik-org/compiler'
import type { CapabilityGraphQuery } from '@rohinik-org/knowledge-graph'
import type { RecommendationCandidate } from '../strategies/recommendation-strategy.js'

export class ExplanationBuilder {
  build(
    candidate: RecommendationCandidate,
    _graphQuery: CapabilityGraphQuery,
    corpusEvidence?: { executionCount: number; coOccurrenceCount: number },
  ): ExplanationPath {
    const steps = candidate.evidenceSteps
    return {
      steps,
      evidence: {
        graphTraversal: steps.length > 0,
        graphEdgeCount: steps.length,
        ...(corpusEvidence ? { corpus: corpusEvidence } : {}),
      },
    }
  }
}
