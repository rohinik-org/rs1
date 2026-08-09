import type { RoutingRequest, ExecutionBudget } from './request.js'
import type { RuntimeModePolicy } from './mode.js'
import type { TierId } from '../interfaces/tier.js'
import type { DecisionTraceBuilder } from './trace.js'

export interface Logger {
  info(msg: string, data?: Record<string, unknown>): void
  warn(msg: string, data?: Record<string, unknown>): void
  error(msg: string, data?: Record<string, unknown>): void
  debug(msg: string, data?: Record<string, unknown>): void
}

export interface MetricsCollector {
  increment(metric: string, labels?: Record<string, string>): void
  histogram(metric: string, value: number, labels?: Record<string, string>): void
  getCounter(metric: string): number
}

export interface ConfigService {
  get<T>(key: string, defaultValue: T): T
}

export interface CacheService {
  get<T>(key: string): Promise<T | undefined>
  set<T>(key: string, value: T, ttlMs?: number): Promise<void>
}

export interface EventBus {
  emit(event: string, data?: unknown): void
  on(event: string, handler: (data: unknown) => void): void
  off(event: string, handler: (data: unknown) => void): void
}

export interface RuntimeServices {
  readonly logger: Logger
  readonly metrics: MetricsCollector
  readonly config: ConfigService
  readonly cache: CacheService
  readonly events: EventBus
}

export interface CancellationToken {
  readonly isCancelled: boolean
  onCancel(fn: () => void): void
}

export interface ExecutionContext {
  readonly request: RoutingRequest
  currentTierId?: TierId
  currentSkillId?: string
  currentStepId?: string
  readonly services: RuntimeServices
  readonly budget: ExecutionBudget
  readonly modePolicy: RuntimeModePolicy
  readonly userContext: Readonly<Record<string, unknown>>
  readonly traceBuilder: DecisionTraceBuilder
  readonly cancellationToken: CancellationToken
  /** True when caller has bound an outputSchemaRef — fallback must support structured output. */
  schemaIsBound?: boolean
}
