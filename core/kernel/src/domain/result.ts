import type { TierId } from '../interfaces/tier.js'
import type { DecisionTrace } from './trace.js'
import type { ResourceCost } from './cost.js'
import type { ExecutionStatus } from './plan.js'

export interface Diagnostic {
  readonly code: string
  readonly message: string
}

export interface ExecutionMetrics {
  readonly durationMs: number
  readonly resourceCost: ResourceCost
  readonly cacheHit: boolean
}

export interface ExecutionOutcome<T = unknown> {
  readonly status: ExecutionStatus
  readonly result: T | undefined
  readonly skillId: string
  readonly stepId: string
  readonly diagnostics: readonly Diagnostic[]
  readonly metrics: ExecutionMetrics
  readonly cacheable: boolean
  readonly retryable: boolean
  readonly error?: Error
}

export interface RoutingResult<T = unknown> {
  readonly requestId: string
  readonly output: T | undefined
  readonly skillId: string
  readonly tierId?: TierId
  readonly decisionTrace: DecisionTrace
  readonly reasoningInvoked: boolean
  readonly explanation: string
  readonly confidence: number
  readonly resourceCost: ResourceCost
  readonly executionTimeMs: number
}
