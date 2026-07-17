import { describe, it, expect } from 'vitest'
import { CsvParseSkill } from '../csv/csv.skill.js'
import type { ExecutionContext } from '@rohinik-org/foundation'

function makeCtx(content: string, intentHint?: string): ExecutionContext {
  return {
    request: {
      id: 'test-1',
      content,
      contentType: 'CSV',
      intentHint,
      context: {},
      metadata: {},
      constraints: { maxRetries: 3, allowReasoning: true, allowNetwork: true, allowDisk: true, mode: 'BALANCED' },
      timestamp: new Date(),
    },
    services: {
      logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
      metrics: { increment: () => {}, histogram: () => {}, getCounter: () => 0 },
      config: { get: (_k: string, d: unknown) => d },
      cache: { get: async () => undefined, set: async () => {} },
      events: { emit: () => {}, on: () => {}, off: () => {} },
    },
    budget: { maxRetries: 3, allowReasoning: true, allowNetwork: true, allowDisk: true, mode: 'BALANCED' },
    modePolicy: {
      allowedTiers: ['DETERMINISTIC'],
      allowedExecutionModels: ['DETERMINISTIC'],
      skipHealthChecks: false,
      aggressiveCache: false,
      maxReasoningAttempts: 0,
      scoringWeights: { confidence: 0.6, cost: 0.2, latency: 0.1, reliability: 0.1 },
    },
    userContext: {},
    traceBuilder: { append: () => {}, build: () => ({ events: [], requestId: 'test-1' }) },
    cancellationToken: { isCancelled: false, onCancel: () => {} },
  } as unknown as ExecutionContext
}

describe('CsvParseSkill', () => {
  const skill = new CsvParseSkill()

  it('has correct metadata', () => {
    expect(skill.metadata.skillId).toBe('csv.parse')
    expect(skill.metadata.tierId).toBe('DETERMINISTIC')
    expect(skill.metadata.executionModel).toBe('DETERMINISTIC')
  })

  it('matches when contentType is CSV and intentHint contains csv', () => {
    const ctx = makeCtx('a,b\n1,2', 'csv parse')
    const result = skill.metadata.matching!.matcher.match(ctx.request)
    expect(result.matched).toBe(true)
  })

  it('does not match when intentHint is missing csv', () => {
    const ctx = makeCtx('a,b\n1,2', 'do something else')
    const result = skill.metadata.matching!.matcher.match(ctx.request)
    expect(result.matched).toBe(false)
  })

  it('parses CSV content into rows', async () => {
    const ctx = makeCtx('name,age\nAlice,30\nBob,25', 'csv parse')
    const outcome = await skill.execute(ctx, {})
    expect(outcome.status).toBe('SUCCESS')
    expect(outcome.result).toEqual([
      { name: 'Alice', age: '30' },
      { name: 'Bob', age: '25' },
    ])
  })

  it('empty content returns FAILURE due to UndetectableDelimiter error', async () => {
    const ctx = makeCtx('', 'csv parse')
    const outcome = await skill.execute(ctx, {})
    expect(outcome.status).toBe('FAILURE')
    expect(outcome.diagnostics.length).toBeGreaterThan(0)
  })

  it('returns FAILURE when CSV has parse errors', async () => {
    // PapaParse reports error when row has more fields than headers
    const ctx = makeCtx('a,b\n1,2,3,4,5', 'csv parse')
    const outcome = await skill.execute(ctx, {})
    expect(outcome.status).toBe('FAILURE')
    expect(outcome.diagnostics.length).toBeGreaterThan(0)
  })
})
