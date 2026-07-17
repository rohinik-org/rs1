import { writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { Skill, SkillMetadata, ExecutionContext, ExecutionOutcome, ResolvedProviders, ResourceCost } from '@rohinik-org/foundation'
import { AllOfMatcher, KeywordMatcher } from '@rohinik-org/foundation'

export class WriteFileSkill implements Skill<void> {
  readonly metadata: SkillMetadata = {
    skillId: 'filesystem.write',
    name: 'Write File',
    tierId: 'LOCAL_TOOL',
    version: '1.0.0',
    executionModel: 'DETERMINISTIC',
    requirements: { environments: { filesystem: { write: true } } },
    matching: {
      matcher: new AllOfMatcher(
        new KeywordMatcher(['write']),
        new KeywordMatcher(['file']),
      ),
    },
  }

  estimatedCost(_ctx: ExecutionContext): ResourceCost {
    return { estimated: { cpuMs: 5 } }
  }

  async execute(ctx: ExecutionContext, _providers: ResolvedProviders): Promise<ExecutionOutcome<void>> {
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
      await mkdir(dirname(filePath), { recursive: true })
      await writeFile(filePath, ctx.request.content, 'utf-8')
      const durationMs = Date.now() - start
      return {
        status: 'SUCCESS', result: undefined,
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
        diagnostics: [{ code: 'FILE_WRITE_ERROR', message: String(error) }],
        metrics: { durationMs, resourceCost: { estimated: { cpuMs: durationMs } }, cacheHit: false },
        cacheable: false, retryable: false,
        error: error instanceof Error ? error : new Error(String(error)),
      }
    }
  }
}
