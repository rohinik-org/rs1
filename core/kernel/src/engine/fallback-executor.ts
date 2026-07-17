import type { ExecutionStep } from '../domain/plan.js'
import type { ExecutionContext } from '../domain/context.js'
import type { ExecutionOutcome } from '../domain/result.js'
import type { RetryExecutor } from './retry-executor.js'
import type { InMemoryCapabilityCatalog } from '../registry/catalog.js'
import { StepExecutor } from './step-executor.js'
import { TimeoutExecutor } from './timeout-executor.js'
import { RetryExecutor as RetryExec } from './retry-executor.js'

export class FallbackExecutor {
  constructor(
    private readonly inner: RetryExecutor,
    private readonly catalog: InMemoryCapabilityCatalog,
  ) {}

  async execute(step: ExecutionStep, ctx: ExecutionContext): Promise<ExecutionOutcome> {
    const primaryOutcome = await this.inner.execute(step, ctx)
    if (primaryOutcome.status === 'SUCCESS') return primaryOutcome
    if (!step.fallbackSkillId) return primaryOutcome

    const fallbackSkill = this.findSkill(step.fallbackSkillId)
    if (!fallbackSkill) return primaryOutcome

    const { fallbackSkillId: _removed, ...rest } = step
    const fallbackStep: ExecutionStep = { ...rest, skillId: step.fallbackSkillId }

    const fallbackInner = new RetryExec(new TimeoutExecutor(new StepExecutor(fallbackSkill)))
    return fallbackInner.execute(fallbackStep, ctx)
  }

  private findSkill(skillId: string) {
    for (const capability of this.catalog.getAll()) {
      const skill = capability.skills.find(s => s.metadata.skillId === skillId)
      if (skill) return skill
    }
    return undefined
  }
}
