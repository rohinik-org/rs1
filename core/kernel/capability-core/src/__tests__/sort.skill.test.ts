import { describe, it, expect } from 'vitest'
import { SortSkill } from '../sort/sort.skill.js'
import type { ExecutionContext } from '@rohinik-org/foundation'

function makeCtx(items: unknown[], key?: string, direction: 'asc' | 'desc' = 'asc'): ExecutionContext {
  return {
    request: { id: 's1', content: '', contentType: 'TEXT', intentHint: 'sort', context: { items, key, direction }, metadata: {}, constraints: { maxRetries: 3, allowReasoning: true, allowNetwork: true, allowDisk: true, mode: 'BALANCED' }, timestamp: new Date() },
    services: { logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }, metrics: { increment: () => {}, histogram: () => {}, getCounter: () => 0 }, config: { get: (_k: string, d: unknown) => d }, cache: { get: async () => undefined, set: async () => {} }, events: { emit: () => {}, on: () => {}, off: () => {} } },
    budget: { maxRetries: 3, allowReasoning: true, allowNetwork: true, allowDisk: true, mode: 'BALANCED' },
    modePolicy: { allowedTiers: ['DETERMINISTIC'], allowedExecutionModels: ['DETERMINISTIC'], skipHealthChecks: false, aggressiveCache: false, maxReasoningAttempts: 0, scoringWeights: { confidence: 0.6, cost: 0.2, latency: 0.1, reliability: 0.1 } },
    userContext: {},
    traceBuilder: { append: () => {}, build: () => ({ events: [], requestId: 's1' }) },
    cancellationToken: { isCancelled: false, onCancel: () => {} },
  } as unknown as ExecutionContext
}

describe('SortSkill', () => {
  const skill = new SortSkill()

  it('sorts numbers ascending', async () => {
    const outcome = await skill.execute(makeCtx([3, 1, 4, 1, 5]), {})
    expect(outcome.result).toEqual([1, 1, 3, 4, 5])
  })

  it('sorts numbers descending', async () => {
    const outcome = await skill.execute(makeCtx([3, 1, 5], undefined, 'desc'), {})
    expect(outcome.result).toEqual([5, 3, 1])
  })

  it('sorts objects by key', async () => {
    const items = [{ name: 'Charlie' }, { name: 'Alice' }, { name: 'Bob' }]
    const outcome = await skill.execute(makeCtx(items, 'name'), {})
    expect((outcome.result as {name:string}[])[0]?.name).toBe('Alice')
  })

  it('matches sort intent', () => {
    expect(skill.metadata.matching!.matcher.match(makeCtx([1, 2]).request).matched).toBe(true)
  })
})
