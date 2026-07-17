import type { Skill, SkillMetadata, ExecutionContext, ExecutionOutcome, ResolvedProviders, ResourceCost } from '@rohinik-org/foundation'
import { KeywordMatcher } from '@rohinik-org/foundation'

export class RegexExtractSkill implements Skill<string[]> {
  readonly metadata: SkillMetadata = {
    skillId: 'regex.extract',
    name: 'Regex Extract',
    tierId: 'DETERMINISTIC',
    version: '1.0.0',
    executionModel: 'DETERMINISTIC',
    requirements: {},
    matching: { matcher: new KeywordMatcher(['regex', 'pattern', 'extract']) },
  }

  estimatedCost(_ctx: ExecutionContext): ResourceCost {
    return { estimated: { cpuMs: 1 } }
  }

  async execute(ctx: ExecutionContext, _providers: ResolvedProviders): Promise<ExecutionOutcome<string[]>> {
    const start = Date.now()
    const pattern = ctx.request.context['pattern'] as string | undefined
    const flags = (ctx.request.context['flags'] as string | undefined) ?? ''
    if (!pattern) {
      return {
        status: 'FAILURE', result: undefined,
        skillId: this.metadata.skillId, stepId: ctx.currentStepId ?? 'step-0',
        diagnostics: [{ code: 'MISSING_PATTERN', message: 'context.pattern is required' }],
        metrics: { durationMs: 0, resourceCost: { estimated: { cpuMs: 0 } }, cacheHit: false },
        cacheable: false, retryable: false, error: new Error('Missing pattern'),
      }
    }
    try {
      const globalFlags = flags.includes('g') ? flags : flags + 'g'
      const re = new RegExp(pattern, globalFlags)
      const matches = Array.from(ctx.request.content.matchAll(re)).map((m: any) => m[0])
      const durationMs = Date.now() - start
      return {
        status: 'SUCCESS', result: matches,
        skillId: this.metadata.skillId, stepId: ctx.currentStepId ?? 'step-0',
        diagnostics: [],
        metrics: { durationMs, resourceCost: { estimated: { cpuMs: durationMs } }, cacheHit: false },
        cacheable: true, retryable: false,
      }
    } catch (error) {
      const durationMs = Date.now() - start
      return {
        status: 'FAILURE', result: undefined,
        skillId: this.metadata.skillId, stepId: ctx.currentStepId ?? 'step-0',
        diagnostics: [{ code: 'REGEX_ERROR', message: String(error) }],
        metrics: { durationMs, resourceCost: { estimated: { cpuMs: durationMs } }, cacheHit: false },
        cacheable: false, retryable: false,
        error: error instanceof Error ? error : new Error(String(error)),
      }
    }
  }
}
