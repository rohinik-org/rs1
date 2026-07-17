export type ExecutionStatus =
  | 'SUCCESS'
  | 'FAILURE'
  | 'SKIPPED'
  | 'TIMEOUT'
  | 'BUDGET_EXCEEDED'
  | 'PROVIDER_UNAVAILABLE'

export interface DiagnosticInfo {
  readonly code: string
  readonly message: string
}

export interface ExecutionMetrics {
  readonly durationMs: number
  readonly resourceCost: import('./skill-resource.js').ResourceCost
  readonly cacheHit: boolean
}

export interface ExecutionOutcome<T = unknown> {
  readonly status: ExecutionStatus
  readonly result: T | undefined
  readonly skillId: string
  readonly stepId: string
  readonly diagnostics: readonly DiagnosticInfo[]
  readonly metrics: ExecutionMetrics
  readonly cacheable: boolean
  readonly retryable: boolean
  readonly error?: Error
}
