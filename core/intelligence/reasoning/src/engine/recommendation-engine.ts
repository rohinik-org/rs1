import { randomUUID } from 'node:crypto'
import type { Hypothesis, ReasoningRecommendation, ReasoningAction, ReasoningPriority, HypothesisCategory } from '@rohinik-org/compiler'

type CategoryMap = Record<HypothesisCategory, { action: ReasoningAction; priority: ReasoningPriority }>

const CATEGORY_MAP: CategoryMap = {
  PROVIDER_DEGRADATION: { action: 'UPDATE_PROVIDER', priority: 'HIGH' },
  CAPABILITY_FAILURE: { action: 'ACQUIRE_CAPABILITY', priority: 'HIGH' },
  NETWORK_ISSUE: { action: 'RETRY', priority: 'MEDIUM' },
  PLANNING_DEFICIENCY: { action: 'REPLAN', priority: 'MEDIUM' },
  POLICY_CONFLICT: { action: 'USER_APPROVAL', priority: 'HIGH' },
  MEMORY_GAP: { action: 'RETRAIN', priority: 'LOW' },
  UNKNOWN: { action: 'USER_APPROVAL', priority: 'LOW' },
}

export class RecommendationEngine {
  recommend(hypotheses: readonly Hypothesis[]): readonly ReasoningRecommendation[] {
    return hypotheses.map(h => {
      const { action, priority } = CATEGORY_MAP[h.category]
      return {
        recommendationId: randomUUID(),
        hypothesisId: h.hypothesisId,
        priority,
        action,
        reason: h.statement,
      }
    })
  }
}
