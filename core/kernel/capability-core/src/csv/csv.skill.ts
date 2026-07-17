import Papa from 'papaparse'
import type { Skill, SkillMetadata, ExecutionContext, ExecutionOutcome, ResolvedProviders, ResourceCost } from '@rohinik-org/foundation'
import { AllOfMatcher, ContentTypeMatcher, KeywordMatcher } from '@rohinik-org/foundation'

export class CsvParseSkill implements Skill<Record<string, string>[]> {
  readonly metadata: SkillMetadata = {
    skillId: 'csv.parse',
    name: 'CSV Parse',
    tierId: 'DETERMINISTIC',
    version: '1.0.0',
    executionModel: 'DETERMINISTIC',
    requirements: {},
    matching: {
      matcher: new AllOfMatcher(
        new ContentTypeMatcher('CSV'),
        new KeywordMatcher(['csv']),
      ),
    },
  }

  estimatedCost(_ctx: ExecutionContext): ResourceCost {
    return { estimated: { cpuMs: 1 } }
  }

  async execute(ctx: ExecutionContext, _providers: ResolvedProviders): Promise<ExecutionOutcome<Record<string, string>[]>> {
    const start = Date.now()
    try {
      const parsed = Papa.parse<Record<string, string>>(ctx.request.content, { header: true, skipEmptyLines: true })
      const durationMs = Date.now() - start
      if (parsed.errors.length > 0) {
        return {
          status: 'FAILURE',
          result: undefined,
          skillId: this.metadata.skillId,
          stepId: ctx.currentStepId ?? 'step-0',
          diagnostics: parsed.errors.map(e => ({ code: e.code, message: e.message })),
          metrics: { durationMs, resourceCost: { estimated: { cpuMs: durationMs } }, cacheHit: false },
          cacheable: false,
          retryable: false,
        }
      }
      return {
        status: 'SUCCESS',
        result: parsed.data,
        skillId: this.metadata.skillId,
        stepId: ctx.currentStepId ?? 'step-0',
        diagnostics: [],
        metrics: { durationMs, resourceCost: { estimated: { cpuMs: durationMs } }, cacheHit: false },
        cacheable: true,
        retryable: false,
      }
    } catch (error) {
      const durationMs = Date.now() - start
      return {
        status: 'FAILURE',
        result: undefined,
        skillId: this.metadata.skillId,
        stepId: ctx.currentStepId ?? 'step-0',
        diagnostics: [{ code: 'CSV_PARSE_ERROR', message: String(error) }],
        metrics: { durationMs, resourceCost: { estimated: { cpuMs: durationMs } }, cacheHit: false },
        cacheable: false,
        retryable: false,
        error: error instanceof Error ? error : new Error(String(error)),
      }
    }
  }
}
