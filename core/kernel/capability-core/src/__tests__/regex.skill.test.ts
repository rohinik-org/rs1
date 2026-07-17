import { describe, it, expect } from 'vitest'
import { RegexExtractSkill } from '../regex/regex.skill.js'
import type { ExecutionContext } from '@rohinik-org/foundation'

function makeCtx(content: string, pattern: string, flags = ''): ExecutionContext {
  return {
    request: { id: 'r1', content, contentType: 'TEXT', intentHint: 'regex extract', context: { pattern, flags }, metadata: {}, constraints: { maxRetries: 3, allowReasoning: true, allowNetwork: true, allowDisk: true, mode: 'BALANCED' }, timestamp: new Date() },
    services: { logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }, metrics: { increment: () => {}, histogram: () => {}, getCounter: () => 0 }, config: { get: (_k: string, d: unknown) => d }, cache: { get: async () => undefined, set: async () => {} }, events: { emit: () => {}, on: () => {}, off: () => {} } },
    budget: { maxRetries: 3, allowReasoning: true, allowNetwork: true, allowDisk: true, mode: 'BALANCED' },
    modePolicy: { allowedTiers: ['DETERMINISTIC'], allowedExecutionModels: ['DETERMINISTIC'], skipHealthChecks: false, aggressiveCache: false, maxReasoningAttempts: 0, scoringWeights: { confidence: 0.6, cost: 0.2, latency: 0.1, reliability: 0.1 } },
    userContext: {},
    traceBuilder: { append: () => {}, build: () => ({ events: [], requestId: 'r1' }) },
    cancellationToken: { isCancelled: false, onCancel: () => {} },
  } as unknown as ExecutionContext
}

describe('RegexExtractSkill', () => {
  const skill = new RegexExtractSkill()

  it('has correct metadata', () => {
    expect(skill.metadata.skillId).toBe('regex.extract')
    expect(skill.metadata.tierId).toBe('DETERMINISTIC')
  })

  it('matches regex intent', () => {
    expect(skill.metadata.matching!.matcher.match(makeCtx('test', '\\d+').request).matched).toBe(true)
  })

  it('extracts all matches', async () => {
    const ctx = makeCtx('Order 123 and Order 456', '\\d+', 'g')
    const outcome = await skill.execute(ctx, {})
    expect(outcome.status).toBe('SUCCESS')
    expect(outcome.result).toEqual(['123', '456'])
  })

  it('returns empty array when no match', async () => {
    const ctx = makeCtx('no numbers here', '\\d+', 'g')
    const outcome = await skill.execute(ctx, {})
    expect(outcome.result).toEqual([])
  })

  it('returns FAILURE for invalid pattern', async () => {
    const ctx = makeCtx('test', '[invalid(')
    const outcome = await skill.execute(ctx, {})
    expect(outcome.status).toBe('FAILURE')
  })
})
