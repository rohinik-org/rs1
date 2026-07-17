import { readFile } from 'node:fs/promises'
import type { Skill, SkillMetadata, ExecutionContext, ExecutionOutcome, ResolvedProviders, ResourceCost } from '@rohinik-org/foundation'
import { AllOfMatcher, AnyOfMatcher, ContentTypeMatcher, KeywordMatcher } from '@rohinik-org/foundation'

export class ReadFileSkill implements Skill<string> {
  readonly metadata: SkillMetadata = {
    skillId: 'filesystem.read',
    name: 'Read File',
    tierId: 'LOCAL_TOOL',
    version: '1.0.0',
    executionModel: 'DETERMINISTIC',
    requirements: { environments: { filesystem: { read: true } } },
    matching: {
      matcher: new AnyOfMatcher(
        new AllOfMatcher(new KeywordMatcher(['read']), new KeywordMatcher(['file'])),
        new ContentTypeMatcher('FILE'),
      ),
    },
  }

  estimatedCost(_ctx: ExecutionContext): ResourceCost {
    return { estimated: { cpuMs: 5 } }
  }

  async execute(ctx: ExecutionContext, _providers: ResolvedProviders): Promise<ExecutionOutcome<string>> {
    const start = Date.now()
    const filePath = ctx.request.context['path'] as string | undefined
    if (!filePath) {
      return {
        status: 'FAILURE', result: undefined,
        skillId: this.metadata.skillId, stepId: ctx.currentStepId ?? 'step-0',
        diagnostics: [{ code: 'MISSING_PATH', message: 'context.path is required' }],
        metrics: { durationMs: 0, resourceCost: { estimated: { cpuMs: 0 } }, cacheHit: false },
        cacheable: false, retryable: false, error: new Error('Missing path'),
      }
    }
    try {
      const content = await readFile(filePath, 'utf-8')
      const durationMs = Date.now() - start
      return {
        status: 'SUCCESS', result: content,
        skillId: this.metadata.skillId, stepId: ctx.currentStepId ?? 'step-0',
        diagnostics: [],
        metrics: { durationMs, resourceCost: { estimated: { cpuMs: durationMs } }, cacheHit: false },
        cacheable: false, retryable: false,
      }
    } catch (error) {
      const durationMs = Date.now() - start
      return {
        status: 'FAILURE', result: undefined,
        skillId: this.metadata.skillId, stepId: ctx.currentStepId ?? 'step-0',
        diagnostics: [{ code: 'FILE_READ_ERROR', message: String(error) }],
        metrics: { durationMs, resourceCost: { estimated: { cpuMs: durationMs } }, cacheHit: false },
        cacheable: false, retryable: false,
        error: error instanceof Error ? error : new Error(String(error)),
      }
    }
  }
}
