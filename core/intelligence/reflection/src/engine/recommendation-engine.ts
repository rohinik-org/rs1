import { randomUUID } from 'node:crypto'
import type { ReflectionCandidate, ReflectionRecommendation, RootCauseCategory, RecommendationKind } from '@rohinik-org/compiler'

const RECOMMENDATION_MAP: Record<RootCauseCategory, RecommendationKind> = {
  MISSING_CAPABILITY: 'ACQUIRE_CAPABILITY',
  PROVIDER_FAILURE: 'CHANGE_PROVIDER',
  BAD_PLAN: 'REPLAN',
  TIMEOUT: 'RETRY',
  POLICY: 'UPDATE_POLICY',
  NETWORK: 'RETRY',
  UNKNOWN: 'NO_ACTION',
  INVALID_INPUT: 'NO_ACTION',
}

export class RecommendationEngine {
  recommend(candidate: ReflectionCandidate): readonly ReflectionRecommendation[] {
    if (candidate.findings.length === 0) return []

    const kind = RECOMMENDATION_MAP[candidate.rootCause.category]
    const findingRefs = candidate.findings.map(f => f.findingId)

    return [{
      recommendationId: randomUUID(),
      kind,
      confidence: candidate.rootCause.confidence,
      explanation: `Root cause ${candidate.rootCause.category} suggests ${kind}`,
      findingRefs,
    }]
  }
}
