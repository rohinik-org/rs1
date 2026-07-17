import type { ExecutionPlan } from '../domain/plan.js'
import type { ExecutionContext } from '../domain/context.js'
import type { ExecutionOutcome } from '../domain/result.js'
import type { InMemoryCapabilityCatalog } from '../registry/catalog.js'
import { BudgetEnforcer } from './budget-enforcer.js'
import { StepExecutor } from './step-executor.js'
import { TimeoutExecutor } from './timeout-executor.js'
import { RetryExecutor } from './retry-executor.js'
import { FallbackExecutor } from './fallback-executor.js'

export class ExecutionEngine {
  private readonly budgetEnforcer = new BudgetEnforcer()

  constructor(private readonly catalog: InMemoryCapabilityCatalog) {}

  async execute(plan: ExecutionPlan, ctx: ExecutionContext): Promise<ExecutionOutcome> {
    // Phase 1: single-step plans only. Multi-step (DAG) is Stage 3+.
    const step = plan.steps[0]
    if (!step) {
      return {
        status: 'FAILURE',
        result: undefined,
        skillId: '',
        stepId: '',
        diagnostics: [{ code: 'EMPTY_PLAN', message: 'Plan has no steps' }],
        metrics: { durationMs: 0, resourceCost: { estimated: {} }, cacheHit: false },
        cacheable: false,
        retryable: false,
      }
    }

    ctx.currentStepId = step.stepId
    ctx.currentSkillId = step.skillId

    // Budget check before touching the skill
    const budgetViolation = this.budgetEnforcer.check(step, ctx)
    if (budgetViolation) {
      ctx.traceBuilder.append({
        version: 1, requestId: ctx.request.id, timestamp: new Date(),
        type: 'EXECUTION_FAILED',
        tierId: step.tierId, skillId: step.skillId, stepId: step.stepId,
        retryable: false, error: 'BUDGET_EXCEEDED',
      })
      ctx.traceBuilder.append({
        version: 1, requestId: ctx.request.id, timestamp: new Date(),
        type: 'COMPLETED',
        reasoningInvoked: false,
      })
      return budgetViolation
    }

    const skill = this.findSkill(step.skillId)
    if (!skill) {
      throw new Error(`Skill not found: ${step.skillId}`)
    }

    const startMs = Date.now()
    ctx.traceBuilder.append({
      version: 1, requestId: ctx.request.id, timestamp: new Date(),
      type: 'EXECUTION_STARTED',
      tierId: step.tierId, skillId: step.skillId, stepId: step.stepId,
    })

    const executor = new FallbackExecutor(
      new RetryExecutor(new TimeoutExecutor(new StepExecutor(skill))),
      this.catalog,
    )

    const outcome = await executor.execute(step, ctx)
    const durationMs = Date.now() - startMs
    const reasoningInvoked = step.tierId === 'REASONING'

    if (outcome.status === 'SUCCESS') {
      ctx.traceBuilder.append({
        version: 1, requestId: ctx.request.id, timestamp: new Date(),
        type: 'EXECUTION_SUCCEEDED',
        tierId: step.tierId, skillId: step.skillId, stepId: step.stepId,
        durationMs,
      })

      if (!reasoningInvoked) {
        ctx.services.metrics.increment('reasoning_avoided_total')
      }
    } else {
      ctx.traceBuilder.append({
        version: 1, requestId: ctx.request.id, timestamp: new Date(),
        type: 'EXECUTION_FAILED',
        tierId: step.tierId, skillId: step.skillId, stepId: step.stepId,
        retryable: outcome.retryable,
        error: outcome.diagnostics[0]?.message ?? outcome.status,
      })
    }

    ctx.traceBuilder.append({
      version: 1, requestId: ctx.request.id, timestamp: new Date(),
      type: 'COMPLETED',
      reasoningInvoked,
      ...(outcome.status === 'SUCCESS' && {
        winnerTierId: step.tierId,
        winnerSkillId: step.skillId,
      }),
    })

    return outcome
  }

  private findSkill(skillId: string) {
    for (const capability of this.catalog.getAll()) {
      const skill = capability.skills.find(s => s.metadata.skillId === skillId)
      if (skill) return skill
    }
    return undefined
  }
}
