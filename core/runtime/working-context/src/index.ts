import type { KnowledgeFragment } from '@rohinik-org/knowledge'
import type { InstalledCapability } from '@rohinik-org/capability-registry'
import type { StructuredIntent } from '@rohinik-org/compiler'

export type { StructuredIntent }

export interface ContextBudget {
  readonly maxTokenBudget: number
  readonly maxMemories: number
  readonly maxKnowledgeFragments: number
  readonly maxCapabilities: number
}

export interface ContextPolicy {
  readonly policyId: string
  readonly budget: ContextBudget
  readonly includeCapabilities: boolean
  readonly includeExecutionHistory: boolean
  readonly memoryRecency: 'recent-first' | 'relevant-first' | 'mixed'
}

export interface WorkingContextIR {
  readonly contextId: string
  readonly requestId: string
  readonly intent: StructuredIntent
  readonly memories: ReadonlyArray<unknown>
  readonly knowledgeFragments: ReadonlyArray<KnowledgeFragment>
  readonly installedCapabilities: ReadonlyArray<InstalledCapability>
  readonly tokenBudget: ContextBudget
  readonly confidence: number
  readonly assembledAt: Date
  readonly contributors: ReadonlyArray<string>
  readonly policy: ContextPolicy
}

export const DEFAULT_CONTEXT_POLICY: ContextPolicy = Object.freeze({
  policyId: 'default',
  budget: Object.freeze({ maxTokenBudget: 8000, maxMemories: 5, maxKnowledgeFragments: 10, maxCapabilities: 20 }),
  includeCapabilities: true,
  includeExecutionHistory: false,
  memoryRecency: 'relevant-first',
})
