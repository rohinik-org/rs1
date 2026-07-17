import type { RecommendationType } from '@rohinik-org/compiler'

export interface RecommendationPolicy {
  readonly policyId: string        // versioned — must change when ranking behaviour changes
  readonly minScore: number
  readonly maxResults: number
  readonly allowedTypes: readonly RecommendationType[]
}

const ALL_TYPES: RecommendationType[] = ['RELATED_CAPABILITY', 'COMPANION_TOOL', 'ALTERNATIVE', 'WORKFLOW_STEP']

export class DefaultRecommendationPolicy implements RecommendationPolicy {
  readonly policyId = 'DefaultRecommendationPolicy@1.0'
  readonly minScore: number
  readonly maxResults: number
  readonly allowedTypes: readonly RecommendationType[]

  constructor(overrides: Partial<Omit<RecommendationPolicy, 'policyId'>> = {}) {
    this.minScore = overrides.minScore ?? 0.0
    this.maxResults = overrides.maxResults ?? 5
    this.allowedTypes = overrides.allowedTypes ?? ALL_TYPES
  }
}
