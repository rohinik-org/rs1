import type { ExecutionStep } from '../domain/plan.js'
import type { ExecutionContext } from '../domain/context.js'
import type { ExecutionOutcome } from '../domain/result.js'
import type { TimeoutExecutor } from './timeout-executor.js'

export class RetryExecutor {
  constructor(private readonly inner: TimeoutExecutor) {}

  async execute(step: ExecutionStep, ctx: ExecutionContext): Promise<ExecutionOutcome> {
    const { maxAttempts, retryableStatuses } = step.retryPolicy
    let outcome: ExecutionOutcome | undefined

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      outcome = await this.inner.execute(step, ctx)

      if (outcome.status === 'SUCCESS') return outcome

      const isRetryableStatus = retryableStatuses.includes(outcome.status)
      if (!isRetryableStatus || !outcome.retryable) return outcome
    }

    return outcome!
  }
}
