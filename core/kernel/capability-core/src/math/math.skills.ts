import type { Skill, SkillMetadata, ExecutionContext, ExecutionOutcome, ResolvedProviders, ResourceCost, Matcher } from '@rohinik-org/foundation'
import { KeywordMatcher } from '@rohinik-org/foundation'

function makeOutcome<T>(result: T, skillId: string, stepId: string, durationMs: number): ExecutionOutcome<T> {
  return {
    status: 'SUCCESS', result, skillId, stepId,
    diagnostics: [],
    metrics: { durationMs, resourceCost: { estimated: { cpuMs: durationMs } }, cacheHit: false },
    cacheable: true, retryable: false,
  }
}

function failureOutcome(code: string, message: string, skillId: string, stepId: string): ExecutionOutcome<never> {
  return {
    status: 'FAILURE', result: undefined, skillId, stepId,
    diagnostics: [{ code, message }],
    metrics: { durationMs: 0, resourceCost: { estimated: { cpuMs: 0 } }, cacheHit: false },
    cacheable: false, retryable: false,
    error: new Error(message),
  }
}

abstract class BaseMathSkill implements Skill<number> {
  abstract readonly metadata: SkillMetadata

  estimatedCost(_ctx: ExecutionContext): ResourceCost {
    return { estimated: { cpuMs: 1 } }
  }

  abstract compute(operands: number[]): { result?: number; error?: { code: string; message: string } }

  async execute(ctx: ExecutionContext, _providers: ResolvedProviders): Promise<ExecutionOutcome<number>> {
    const start = Date.now()
    const operands = ctx.request.context['operands'] as number[] | undefined
    if (!Array.isArray(operands) || operands.length < 2) {
      return failureOutcome('INVALID_OPERANDS', 'operands must be an array of at least 2 numbers', this.metadata.skillId, ctx.currentStepId ?? 'step-0')
    }
    const { result, error } = this.compute(operands)
    if (error) return failureOutcome(error.code, error.message, this.metadata.skillId, ctx.currentStepId ?? 'step-0')
    return makeOutcome(result ?? 0, this.metadata.skillId, ctx.currentStepId ?? 'step-0', Date.now() - start)
  }
}

function mathMeta(skillId: string, name: string, matcher: Matcher): SkillMetadata {
  return {
    skillId, name, tierId: 'DETERMINISTIC', version: '1.0.0',
    executionModel: 'DETERMINISTIC', requirements: {},
    matching: { matcher },
  }
}

export class MathAddSkill extends BaseMathSkill {
  readonly metadata: SkillMetadata = mathMeta('math.add', 'Math Add', new KeywordMatcher(['add', 'sum', 'plus']))
  compute(operands: number[]): { result?: number; error?: { code: string; message: string } } {
    return { result: operands.reduce((a, b) => a + b, 0) }
  }
}

export class MathSubtractSkill extends BaseMathSkill {
  readonly metadata: SkillMetadata = mathMeta('math.subtract', 'Math Subtract', new KeywordMatcher(['subtract', 'minus']))
  compute(operands: number[]): { result?: number; error?: { code: string; message: string } } {
    return { result: operands.slice(1).reduce((a: number, b: number) => a - b, operands[0] ?? 0) }
  }
}

export class MathMultiplySkill extends BaseMathSkill {
  readonly metadata: SkillMetadata = mathMeta('math.multiply', 'Math Multiply', new KeywordMatcher(['multiply', 'times', 'product']))
  compute(operands: number[]): { result?: number; error?: { code: string; message: string } } {
    return { result: operands.reduce((a, b) => a * b, 1) }
  }
}

export class MathDivideSkill extends BaseMathSkill {
  readonly metadata: SkillMetadata = mathMeta('math.divide', 'Math Divide', new KeywordMatcher(['divide']))
  compute(operands: number[]): { result?: number; error?: { code: string; message: string } } {
    for (let i = 1; i < operands.length; i++) {
      if (operands[i] === 0) return { error: { code: 'DIVIDE_BY_ZERO', message: 'Cannot divide by zero' } }
    }
    return { result: operands.slice(1).reduce((a: number, b: number) => a / b, operands[0] ?? 0) }
  }
}
