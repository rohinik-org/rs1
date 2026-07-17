import type { Skill } from '../interfaces/skill.js'
import type { ExecutionStep } from '../domain/plan.js'
import type { ExecutionContext } from '../domain/context.js'
import type { ExecutionOutcome } from '../domain/result.js'
import { ZERO_COST } from '../domain/cost.js'

export class StepExecutor {
  constructor(private readonly skill: Skill) {}

  async execute(step: ExecutionStep, ctx: ExecutionContext): Promise<ExecutionOutcome> {
    try {
      return await this.skill.execute(ctx, step.resolvedProviders)
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      return {
        status: 'FAILURE',
        result: undefined,
        skillId: step.skillId,
        stepId: step.stepId,
        diagnostics: [{ code: 'EXECUTION_ERROR', message: error.message }],
        metrics: { durationMs: 0, resourceCost: ZERO_COST, cacheHit: false },
        cacheable: false,
        retryable: true,
        error,
      }
    }
  }
}
