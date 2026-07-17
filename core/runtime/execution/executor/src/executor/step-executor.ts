import type { WorkflowPlanStep, StepExecutionRecord } from '@rohinik-org/compiler'
import type { ExecutorCapabilityResolver } from '../resolver/capability-resolver.js'
import { ExecutionContext } from '../state/execution-context.js'
import { ExecutionJournal } from '../journal/execution-journal.js'
import { ExecutionMetricsCollector } from '../metrics/execution-metrics-collector.js'
import { RetryHandler } from '../retry/retry-handler.js'

interface StepRetryConfig {
  readonly maxRetries: number
  readonly baseDelayMs: number
}

export class StepExecutor {
  private readonly retryHandler: RetryHandler

  constructor(
    private readonly resolver: ExecutorCapabilityResolver,
    retryConfig: StepRetryConfig,
  ) {
    this.retryHandler = new RetryHandler(retryConfig)
  }

  async execute(
    step: WorkflowPlanStep,
    context: ExecutionContext,
    journal: ExecutionJournal,
    metrics: ExecutionMetricsCollector,
  ): Promise<StepExecutionRecord> {
    const startedAt = new Date().toISOString()
    let attempts = 0

    journal.append('STEP_STARTED', { skillId: step.skillId }, step.position)

    const input = context.getOutput(step.position - 1) ?? undefined

    try {
      const stepStart = Date.now()
      let output: unknown
      let providerUsed = 'unknown'

      await this.retryHandler.execute(async () => {
        attempts++
        const invocation = this.resolver.resolve(step.skillId, input)
        journal.append('PROVIDER_INVOKED', { skillId: step.skillId, attempt: attempts }, step.position)
        const result = await invocation.invoke()
        output = result.output
        providerUsed = result.providerUsed
        metrics.recordProviderLatency(step.skillId, result.latencyMs)
        if (result.tokensUsed) metrics.recordTokens(result.tokensUsed)
        if (result.estimatedCostUsd) metrics.recordCost(result.estimatedCostUsd)
      })

      const completedAt = new Date().toISOString()
      const durationMs = Date.now() - stepStart
      metrics.recordStepDuration(step.position, durationMs)

      context.setOutput(step.position, output)
      context.markCompleted(step.position)

      journal.append('STEP_COMPLETED', { skillId: step.skillId, durationMs }, step.position)

      return {
        stepId: `${step.skillId}-${step.position}`,
        position: step.position,
        skillId: step.skillId,
        state: 'COMPLETED',
        startedAt,
        completedAt,
        attempts,
        providerUsed,
        input,
        output,
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      journal.append('STEP_FAILED', { skillId: step.skillId, error }, step.position)
      return {
        stepId: `${step.skillId}-${step.position}`,
        position: step.position,
        skillId: step.skillId,
        state: 'FAILED',
        startedAt,
        attempts,
        error,
        input,
      }
    }
  }
}
