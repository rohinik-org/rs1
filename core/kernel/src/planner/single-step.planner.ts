import { randomUUID } from 'node:crypto'
import type { Planner } from '../interfaces/planner.js'
import type { SelectedSkill } from '../domain/selected-skill.js'
import type { ExecutionContext } from '../domain/context.js'
import type { ExecutionPlan } from '../domain/plan.js'

export class SingleStepPlanner implements Planner {
  async createPlan(selected: SelectedSkill, ctx: ExecutionContext): Promise<ExecutionPlan> {
    const step = Object.freeze({
      stepId: randomUUID(),
      skillId: selected.skill.metadata.skillId,
      tierId: selected.tierId,
      inputs: Object.freeze([{ source: 'REQUEST' as const }]),
      executionPolicy: 'BEST_SCORE' as const,
      timeoutMs: 30_000,
      retryPolicy: Object.freeze({
        maxAttempts: ctx.budget.maxRetries,
        retryableStatuses: Object.freeze(['FAILURE', 'TIMEOUT'] as const),
      }),
      resolvedProviders: selected.resolvedProviders,
      estimatedCost: selected.estimatedCost,
      score: selected.score,
      dependsOn: Object.freeze([] as string[]),
      constraints: Object.freeze({}),
    })

    return Object.freeze({
      planId: randomUUID(),
      requestId: ctx.request.id,
      steps: Object.freeze([step]),
      budget: ctx.budget,
      createdAt: new Date(),
    })
  }
}
