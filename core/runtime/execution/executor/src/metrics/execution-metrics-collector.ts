import type { ExecutionMetrics } from '@rohinik-org/compiler'

export class ExecutionMetricsCollector {
  private readonly stepDurations = new Map<number, number>()
  private readonly providerLatencies = new Map<string, number>()
  private retryCount = 0
  private estimatedCostUsd = 0
  private tokensUsed = 0
  private startedAt = 0

  start(): void { this.startedAt = Date.now() }

  recordStepDuration(position: number, ms: number): void {
    this.stepDurations.set(position, ms)
  }

  recordProviderLatency(skillId: string, ms: number): void {
    this.providerLatencies.set(skillId, (this.providerLatencies.get(skillId) ?? 0) + ms)
  }

  recordRetry(): void { this.retryCount++ }

  recordCost(usd: number): void { this.estimatedCostUsd += usd }

  recordTokens(tokens: number): void { this.tokensUsed += tokens }

  build(): ExecutionMetrics {
    return {
      totalDurationMs: this.startedAt > 0 ? Date.now() - this.startedAt : 0,
      stepDurations: Object.fromEntries(this.stepDurations.entries()),
      retryCount: this.retryCount,
      providerLatencyMs: Object.fromEntries(this.providerLatencies.entries()),
      estimatedCostUsd: this.estimatedCostUsd,
      tokensUsed: this.tokensUsed,
    }
  }
}
