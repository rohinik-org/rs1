import type { ExecutionStep, ExecutionOutcome, ExecutionContext } from '@rohinik-org/kernel'
import type { ExecutionPlan } from '@rohinik-org/execution-ir'
import { ExecutionEngine, InMemoryCapabilityCatalog } from '@rohinik-org/kernel'

export class SkillInvoker {
  private readonly engine: ExecutionEngine

  constructor(catalog: InMemoryCapabilityCatalog) {
    this.engine = new ExecutionEngine(catalog)
  }

  async invoke(step: ExecutionStep, ctx: ExecutionContext): Promise<ExecutionOutcome> {
    // Adapt single step into a single-step ExecutionPlan for ExecutionEngine (which is single-step only)
    const singleStepPlan: ExecutionPlan = {
      planId: `invoke-${step.stepId}`,
      requestId: ctx.request.id,
      steps: [step],
      budget: ctx.budget,
      createdAt: new Date(),
    }
    return this.engine.execute(singleStepPlan, ctx)
  }
}
