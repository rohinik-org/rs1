import type { TierId } from '../interfaces/tier.js'
import type { ContentType } from './request.js'
import type { SkillScore } from '../interfaces/skill.js'
import type { ProviderResolution } from '../interfaces/resolver.js'

export type RejectionReason =
  | 'EXECUTION_MODEL_FORBIDDEN'
  | 'PROVIDER_UNAVAILABLE'
  | 'BUDGET_EXCEEDED'
  | 'HEALTH_CHECK_FAILED'
  | 'TIER_DISABLED'

export interface DecisionEventBase {
  readonly version: number
  readonly requestId: string
  readonly timestamp: Date
}

export type DecisionEvent =
  | DecisionEventBase & { type: 'REQUEST_RECEIVED'; contentType: ContentType }
  | DecisionEventBase & { type: 'TIER_STARTED'; tierId: TierId }
  | DecisionEventBase & { type: 'SKILL_MATCHED'; tierId: TierId; skillId: string }
  | DecisionEventBase & { type: 'SKILL_REJECTED'; tierId: TierId; skillId: string; reason: RejectionReason }
  | DecisionEventBase & { type: 'SKILL_SCORED'; tierId: TierId; skillId: string; score: SkillScore }
  | DecisionEventBase & { type: 'PROVIDER_RESOLVED'; skillId: string; requirementKey: string; resolution: ProviderResolution }
  | DecisionEventBase & { type: 'PROVIDER_UNAVAILABLE'; skillId: string; requirementKey: string; reason: string }
  | DecisionEventBase & { type: 'SKILL_SELECTED'; tierId: TierId; skillId: string; score: SkillScore }
  | DecisionEventBase & { type: 'EXECUTION_STARTED'; tierId: TierId; skillId: string; stepId: string }
  | DecisionEventBase & { type: 'EXECUTION_SUCCEEDED'; tierId: TierId; skillId: string; stepId: string; durationMs: number }
  | DecisionEventBase & { type: 'EXECUTION_FAILED'; tierId: TierId; skillId: string; stepId: string; retryable: boolean; error: string }
  | DecisionEventBase & { type: 'RETRY_STARTED'; tierId: TierId; skillId: string; attempt: number }
  | DecisionEventBase & { type: 'FALLBACK_STARTED'; tierId: TierId; fromSkillId: string; toSkillId: string }
  | DecisionEventBase & { type: 'COMPLETED'; winnerTierId?: TierId; winnerSkillId?: string; reasoningInvoked: boolean }
  | DecisionEventBase & {
      type: 'EXECUTION_RECORD_READY'
      trace: DecisionTrace
      totalLatencyMs: number
      estimatedCostUsd?: number
      tokensUsed?: number
    }

export interface DecisionTrace {
  readonly requestId: string
  readonly events: readonly DecisionEvent[]
  readonly reasoningInvoked: boolean
  readonly winnerTierId?: TierId
  readonly winnerSkillId?: string
}

export interface DecisionTraceBuilder {
  append(event: DecisionEvent): void
  build(): DecisionTrace
}
