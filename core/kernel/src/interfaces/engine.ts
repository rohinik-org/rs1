import type { ExecutionPlan } from '../domain/plan.js'
import type { ExecutionContext } from '../domain/context.js'
import type { ExecutionOutcome } from '../domain/result.js'

export interface Engine {
  execute(plan: ExecutionPlan, ctx: ExecutionContext): Promise<ExecutionOutcome>
}
