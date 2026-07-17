import type { ExecutionStep } from '../domain/plan.js'
import type { ExecutionContext } from '../domain/context.js'
import type { ExecutionOutcome } from '../domain/result.js'
import { ZERO_COST } from '../domain/cost.js'

export class BudgetEnforcer {
  check(step: ExecutionStep, ctx: ExecutionContext): ExecutionOutcome | null {
    const budget = ctx.budget
    const estimated = step.estimatedCost.estimated

    if (!budget.allowReasoning && step.tierId === 'REASONING') {
      return this.exceeded(step, 'Reasoning disallowed by budget')
    }

    if (budget.maxCostUsd !== undefined && estimated.usd !== undefined) {
      if (estimated.usd > budget.maxCostUsd) {
        return this.exceeded(step, `Estimated cost $${estimated.usd} exceeds budget $${budget.maxCostUsd}`)
      }
    }

    if (budget.maxTokens !== undefined && estimated.tokens !== undefined) {
      if (estimated.tokens > budget.maxTokens) {
        return this.exceeded(step, `Estimated tokens ${estimated.tokens} exceeds budget ${budget.maxTokens}`)
      }
    }

    return null
  }

  private exceeded(step: ExecutionStep, message: string): ExecutionOutcome {
    return {
      status: 'BUDGET_EXCEEDED',
      result: undefined,
      skillId: step.skillId,
      stepId: step.stepId,
      diagnostics: [{ code: 'BUDGET_EXCEEDED', message }],
      metrics: { durationMs: 0, resourceCost: ZERO_COST, cacheHit: false },
      cacheable: false,
      retryable: false,
    }
  }
}
