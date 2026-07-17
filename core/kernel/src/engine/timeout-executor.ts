import type { ExecutionStep } from '../domain/plan.js'
import type { ExecutionContext } from '../domain/context.js'
import type { ExecutionOutcome } from '../domain/result.js'
import type { StepExecutor } from './step-executor.js'
import { ZERO_COST } from '../domain/cost.js'

export class TimeoutExecutor {
  constructor(private readonly inner: StepExecutor) {}

  async execute(step: ExecutionStep, ctx: ExecutionContext): Promise<ExecutionOutcome> {
    const timeoutMs = step.timeoutMs

    const timeoutPromise = new Promise<ExecutionOutcome>((resolve) =>
      setTimeout(() => resolve({
        status: 'TIMEOUT',
        result: undefined,
        skillId: step.skillId,
        stepId: step.stepId,
        diagnostics: [{ code: 'TIMEOUT', message: `Step exceeded ${timeoutMs}ms` }],
        metrics: { durationMs: timeoutMs, resourceCost: ZERO_COST, cacheHit: false },
        cacheable: false,
        retryable: true,
      }), timeoutMs)
    )

    return Promise.race([this.inner.execute(step, ctx), timeoutPromise])
  }
}
