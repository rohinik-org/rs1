import type { Skill, SkillMetadata, ExecutionContext, ExecutionOutcome, ResolvedProviders, ResourceCost } from '@rohinik-org/foundation'
import { AnyOfMatcher, ContentTypeMatcher, KeywordMatcher } from '@rohinik-org/foundation'

export class JsonParseSkill implements Skill<unknown> {
  readonly metadata: SkillMetadata = {
    skillId: 'json.parse',
    name: 'JSON Parse',
    tierId: 'DETERMINISTIC',
    version: '1.0.0',
    executionModel: 'DETERMINISTIC',
    requirements: {},
    matching: {
      matcher: new AnyOfMatcher(
        new ContentTypeMatcher('JSON'),
        new KeywordMatcher(['json']),
      ),
    },
  }

  estimatedCost(_ctx: ExecutionContext): ResourceCost {
    return { estimated: { cpuMs: 1 } }
  }

  async execute(ctx: ExecutionContext, _providers: ResolvedProviders): Promise<ExecutionOutcome<unknown>> {
    const start = Date.now()
    try {
      const result = JSON.parse(ctx.request.content)
      const durationMs = Date.now() - start
      return {
        status: 'SUCCESS', result,
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
        diagnostics: [{ code: 'JSON_PARSE_ERROR', message: String(error) }],
        metrics: { durationMs, resourceCost: { estimated: { cpuMs: durationMs } }, cacheHit: false },
        cacheable: false, retryable: false,
        error: error instanceof Error ? error : new Error(String(error)),
      }
    }
  }
}
