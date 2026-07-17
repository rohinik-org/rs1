import type { TierId } from '../interfaces/tier.js'
import type { ResolvedProviders } from '../interfaces/resolver.js'
import type { ResourceCost } from './cost.js'
import type { SkillScore } from '../interfaces/skill.js'
import type { ExecutionBudget } from './request.js'

export type ExecutionStatus =
  | 'SUCCESS'
  | 'FAILURE'
  | 'SKIPPED'
  | 'TIMEOUT'
  | 'BUDGET_EXCEEDED'
  | 'PROVIDER_UNAVAILABLE'

export type ExecutionPolicy = 'BEST_SCORE' | 'FIRST_SUCCESS' | 'PARALLEL'
// PARALLEL: defined, not executed in Phase 1

export interface RetryPolicy {
  readonly maxAttempts: number
  readonly retryableStatuses: readonly ExecutionStatus[]
}

export interface ExecutionInput {
  readonly source: 'REQUEST' | 'STEP_OUTPUT'
  readonly stepId?: string
  readonly transform?: string
}

export interface ExecutionStep {
  readonly stepId: string
  readonly skillId: string
  readonly tierId: TierId
  readonly inputs: readonly ExecutionInput[]
  readonly fallbackSkillId?: string
  readonly executionPolicy: ExecutionPolicy
  readonly timeoutMs: number
  readonly retryPolicy: RetryPolicy
  readonly resolvedProviders: ResolvedProviders
  readonly estimatedCost: ResourceCost
  readonly score: SkillScore
  readonly dependsOn: readonly string[]
  readonly constraints: Readonly<Record<string, unknown>>
}

export interface ExecutionPlan {
  readonly planId: string
  readonly requestId: string
  readonly steps: readonly ExecutionStep[]
  readonly budget: ExecutionBudget
  readonly createdAt: Date
}
