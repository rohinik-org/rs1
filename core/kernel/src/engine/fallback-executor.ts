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

    // Schema guard (Stage 16C boundary 14): if a schema is bound, the fallback
    // must declare structuredOutput requirement. Without it the fallback cannot
    // guarantee schema-compatible output — block it rather than silently degrade.
    if (ctx.schemaIsBound) {
      const fallbackSupportsStructured =
        fallbackSkill.metadata.requirements.providerCapabilities?.reasoningEngine?.structuredOutput === true

      if (!fallbackSupportsStructured) {
        return {
          ...primaryOutcome,
          diagnostics: [
            ...primaryOutcome.diagnostics,
            {
              code: 'SCHEMA_FALLBACK_BLOCKED',
              message:
                `Fallback skill '${step.fallbackSkillId}' does not declare structuredOutput requirement. ` +
                `Fallback blocked because outputSchemaRef is bound.`,
            },
          ],
        }
      }

      // Fallback supports structured output — permitted degradation, proceed with evidence
      ctx.traceBuilder.append({
        version: 1, requestId: ctx.request.id, timestamp: new Date(),
        type: 'EXECUTION_STARTED',
        tierId: step.tierId, skillId: step.fallbackSkillId, stepId: step.stepId,
        // ponytail: trace entry re-uses existing trace type; schema-fallback detail in diagnostics
      })
    }

    const { fallbackSkillId: _removed, ...rest } = step
    const fallbackStep: ExecutionStep = { ...rest, skillId: step.fallbackSkillId }

    const fallbackInner = new RetryExec(new TimeoutExecutor(new StepExecutor(fallbackSkill)))
    const fallbackOutcome = await fallbackInner.execute(fallbackStep, ctx)

    if (ctx.schemaIsBound && fallbackOutcome.status === 'SUCCESS') {
      // Permitted degradation succeeded — annotate with evidence
      return {
        ...fallbackOutcome,
        diagnostics: [
          ...fallbackOutcome.diagnostics,
          {
            code: 'SCHEMA_FALLBACK_PERMITTED_DEGRADATION',
            message: `Fallback skill '${step.fallbackSkillId}' executed with schema binding (permitted degradation).`,
          },
        ],
      }
    }

    return fallbackOutcome
  }

  private findSkill(skillId: string) {
    for (const capability of this.catalog.getAll()) {
      const skill = capability.skills.find(s => s.metadata.skillId === skillId)
      if (skill) return skill
    }
    return undefined
  }
}
