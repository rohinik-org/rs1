import type { Skill, SkillMetadata, ExecutionContext, ExecutionOutcome, ResolvedProviders, ResourceCost } from '@rohinik-org/foundation'

export class ReasoningSkill implements Skill<unknown> {
  readonly metadata: SkillMetadata = {
    skillId: 'builtin:reasoning',
    name: 'Reasoning',
    tierId: 'REASONING',
    version: '1.0.0',
    executionModel: 'REASONING',
    requirements: { providerCapabilities: { reasoningEngine: { reasoning: true } } },
  }

  estimatedCost(_ctx: ExecutionContext): ResourceCost {
    return { estimated: { tokens: 1000, usd: 0.01, cpuMs: 2000 } }
  }

  evaluate(_ctx: ExecutionContext) {
    return {
      matched: true as const,
      score: { skillId: 'builtin:reasoning', components: [], finalScore: 0.5 },
    }
  }

  async execute(
    // ponytail: any casts — reasoning skill bridges typed kernel to loosely-typed provider call
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ctx: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    providers: any,
  ): Promise<ExecutionOutcome<unknown>> {
    const provider = (providers as ResolvedProviders)['reasoningEngine']?.provider as
      | { reason?: (req: unknown, ctx: unknown) => Promise<ExecutionOutcome<unknown>> }
      | undefined

    if (!provider?.reason) {
      return {
        status: 'FAILURE',
        result: undefined,
        skillId: 'builtin:reasoning',
        stepId: 'step-0',
        diagnostics: [{ code: 'NO_PROVIDER', message: 'No reasoning provider available' }],
        metrics: { durationMs: 0, resourceCost: { estimated: { cpuMs: 0 } }, cacheHit: false },
        cacheable: false,
        retryable: false,
      }
    }

    return provider.reason(
      { prompt: ctx.request?.content ?? '', requiredCapabilities: {}, context: {} },
      ctx,
    )
  }
}
