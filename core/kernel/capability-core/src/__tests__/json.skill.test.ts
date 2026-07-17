import { describe, it, expect } from 'vitest'
import { JsonParseSkill } from '../json/json.skill.js'
import type { ExecutionContext } from '@rohinik-org/foundation'

function makeCtx(content: string, intentHint?: string, contentType = 'TEXT'): ExecutionContext {
  return {
    request: { id: 'j1', content, contentType, intentHint, context: {}, metadata: {}, constraints: { maxRetries: 3, allowReasoning: true, allowNetwork: true, allowDisk: true, mode: 'BALANCED' }, timestamp: new Date() },
    services: { logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }, metrics: { increment: () => {}, histogram: () => {}, getCounter: () => 0 }, config: { get: (_k: string, d: unknown) => d }, cache: { get: async () => undefined, set: async () => {} }, events: { emit: () => {}, on: () => {}, off: () => {} } },
    budget: { maxRetries: 3, allowReasoning: true, allowNetwork: true, allowDisk: true, mode: 'BALANCED' },
    modePolicy: { allowedTiers: ['DETERMINISTIC'], allowedExecutionModels: ['DETERMINISTIC'], skipHealthChecks: false, aggressiveCache: false, maxReasoningAttempts: 0, scoringWeights: { confidence: 0.6, cost: 0.2, latency: 0.1, reliability: 0.1 } },
    userContext: {},
    traceBuilder: { append: () => {}, build: () => ({ events: [], requestId: 'j1' }) },
    cancellationToken: { isCancelled: false, onCancel: () => {} },
  } as unknown as ExecutionContext
}

describe('JsonParseSkill', () => {
  const skill = new JsonParseSkill()

  it('has correct metadata', () => {
    expect(skill.metadata.skillId).toBe('json.parse')
    expect(skill.metadata.tierId).toBe('DETERMINISTIC')
  })

  it('matches when contentType is JSON', () => {
    const ctx = makeCtx('{"a":1}', 'json parse', 'JSON')
    expect(skill.metadata.matching!.matcher.match(ctx.request).matched).toBe(true)
  })

  it('matches when intentHint contains json', () => {
    const ctx = makeCtx('{"a":1}', 'parse json')
    expect(skill.metadata.matching!.matcher.match(ctx.request).matched).toBe(true)
  })

  it('does not match unrelated intent', () => {
    expect(skill.metadata.matching!.matcher.match(makeCtx('hello', 'csv parse').request).matched).toBe(false)
  })

  it('parses valid JSON', async () => {
    const ctx = makeCtx('{"name":"Alice","age":30}', 'json parse', 'JSON')
    const outcome = await skill.execute(ctx, {})
    expect(outcome.status).toBe('SUCCESS')
    expect(outcome.result).toEqual({ name: 'Alice', age: 30 })
  })

  it('returns FAILURE for invalid JSON', async () => {
    const ctx = makeCtx('{bad json}', 'json parse', 'JSON')
    const outcome = await skill.execute(ctx, {})
    expect(outcome.status).toBe('FAILURE')
  })
})
