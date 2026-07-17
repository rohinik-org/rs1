import type { SelectedSkill } from '../domain/selected-skill.js'
import type { ExecutionContext } from '../domain/context.js'
import type { ExecutionPlan } from '../domain/plan.js'

export interface Planner {
  createPlan(selected: SelectedSkill, ctx: ExecutionContext): Promise<ExecutionPlan>
}
