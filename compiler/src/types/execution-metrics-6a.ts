export interface ExecutionMetrics {
  readonly totalDurationMs: number
  readonly stepDurations: Readonly<Record<number, number>>
  readonly retryCount: number
  readonly providerLatencyMs: Readonly<Record<string, number>>
  readonly estimatedCostUsd: number
  readonly tokensUsed: number
  readonly peakMemoryMb?: number
}
