import { describe, it, expect } from 'vitest'
import { MathAddSkill, MathSubtractSkill, MathMultiplySkill, MathDivideSkill } from '../math/math.skills.js'
import type { ExecutionContext } from '@rohinik-org/foundation'

function makeCtx(intentHint: string, operands: number[]): ExecutionContext {
  return {
    request: { id: 'm1', content: '', contentType: 'TEXT', intentHint, context: { operands }, metadata: {}, constraints: { maxRetries: 3, allowReasoning: true, allowNetwork: true, allowDisk: true, mode: 'BALANCED' }, timestamp: new Date() },
    services: { logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }, metrics: { increment: () => {}, histogram: () => {}, getCounter: () => 0 }, config: { get: (_k: string, d: unknown) => d }, cache: { get: async () => undefined, set: async () => {} }, events: { emit: () => {}, on: () => {}, off: () => {} } },
    budget: { maxRetries: 3, allowReasoning: true, allowNetwork: true, allowDisk: true, mode: 'BALANCED' },
    modePolicy: { allowedTiers: ['DETERMINISTIC'], allowedExecutionModels: ['DETERMINISTIC'], skipHealthChecks: false, aggressiveCache: false, maxReasoningAttempts: 0, scoringWeights: { confidence: 0.6, cost: 0.2, latency: 0.1, reliability: 0.1 } },
    userContext: {},
    traceBuilder: { append: () => {}, build: () => ({ events: [], requestId: 'm1' }) },
    cancellationToken: { isCancelled: false, onCancel: () => {} },
  } as unknown as ExecutionContext
}

describe('Math skills', () => {
  it('MathAddSkill adds numbers', async () => {
    const ctx = makeCtx('math add', [3, 4])
    const outcome = await new MathAddSkill().execute(ctx, {})
    expect(outcome.status).toBe('SUCCESS')
    expect(outcome.result).toBe(7)
  })

  it('MathSubtractSkill subtracts', async () => {
    const ctx = makeCtx('math subtract', [10, 3])
    const outcome = await new MathSubtractSkill().execute(ctx, {})
    expect(outcome.result).toBe(7)
  })

  it('MathMultiplySkill multiplies', async () => {
    const ctx = makeCtx('math multiply', [3, 4])
    const outcome = await new MathMultiplySkill().execute(ctx, {})
    expect(outcome.result).toBe(12)
  })

  it('MathDivideSkill divides', async () => {
    const ctx = makeCtx('math divide', [12, 4])
    const outcome = await new MathDivideSkill().execute(ctx, {})
    expect(outcome.result).toBe(3)
  })

  it('MathDivideSkill errors on divide by zero', async () => {
    const ctx = makeCtx('math divide', [12, 0])
    const outcome = await new MathDivideSkill().execute(ctx, {})
    expect(outcome.status).toBe('FAILURE')
    expect(outcome.diagnostics[0]?.code).toBe('DIVIDE_BY_ZERO')
  })

  it('MathAddSkill matches intent hint containing add', () => {
    expect(new MathAddSkill().metadata.matching!.matcher.match(makeCtx('add numbers', [1, 2]).request).matched).toBe(true)
  })

  it('MathAddSkill does not match unrelated intent', () => {
    expect(new MathAddSkill().metadata.matching!.matcher.match(makeCtx('parse csv', [1, 2]).request).matched).toBe(false)
  })
})
