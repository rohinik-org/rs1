import type { Skill, SkillMetadata, ExecutionContext, ExecutionOutcome, ResolvedProviders, ResourceCost } from '@rohinik-org/foundation'
import { KeywordMatcher } from '@rohinik-org/foundation'

export class SortSkill implements Skill<unknown[]> {
  readonly metadata: SkillMetadata = {
    skillId: 'sort.sort',
    name: 'Sort',
    tierId: 'DETERMINISTIC',
    version: '1.0.0',
    executionModel: 'DETERMINISTIC',
    requirements: {},
    matching: { matcher: new KeywordMatcher(['sort', 'order', 'rank']) },
  }

  estimatedCost(_ctx: ExecutionContext): ResourceCost {
    return { estimated: { cpuMs: 1 } }
  }

  async execute(ctx: ExecutionContext, _providers: ResolvedProviders): Promise<ExecutionOutcome<unknown[]>> {
    const start = Date.now()
    const items = ctx.request.context['items'] as unknown[] | undefined
    if (!Array.isArray(items)) {
      return {
        status: 'FAILURE', result: undefined,
        skillId: this.metadata.skillId, stepId: ctx.currentStepId ?? 'step-0',
        diagnostics: [{ code: 'MISSING_ITEMS', message: 'context.items must be an array' }],
        metrics: { durationMs: 0, resourceCost: { estimated: { cpuMs: 0 } }, cacheHit: false },
        cacheable: false, retryable: false, error: new Error('Missing items'),
      }
    }
    const key = ctx.request.context['key'] as string | undefined
    const direction = (ctx.request.context['direction'] as string | undefined) ?? 'asc'
    const sorted = [...items].sort((a, b) => {
      const av = key ? (a as Record<string, unknown>)[key] : a
      const bv = key ? (b as Record<string, unknown>)[key] : b
      if (av === bv) return 0
      const cmp = av! < bv! ? -1 : 1
      return direction === 'desc' ? -cmp : cmp
    })
    const durationMs = Date.now() - start
    return {
      status: 'SUCCESS', result: sorted,
      skillId: this.metadata.skillId, stepId: ctx.currentStepId ?? 'step-0',
      diagnostics: [],
      metrics: { durationMs, resourceCost: { estimated: { cpuMs: durationMs } }, cacheHit: false },
      cacheable: true, retryable: false,
    }
  }
}
