import { describe, it, expect } from 'vitest'
import { ReadFileSkill } from '../read.skill.js'
import { WriteFileSkill } from '../write.skill.js'
import * as os from 'node:os'
import * as path from 'node:path'
import type { ExecutionContext } from '@rohinik-org/foundation'

function makeCtx(content: string, filePath: string, intentHint: string): ExecutionContext {
  return {
    request: { id: 'fs1', content, contentType: 'FILE', intentHint, context: { path: filePath }, metadata: {}, constraints: { maxRetries: 3, allowReasoning: false, allowNetwork: false, allowDisk: true, mode: 'BALANCED' }, timestamp: new Date() },
    services: { logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }, metrics: { increment: () => {}, histogram: () => {}, getCounter: () => 0 }, config: { get: (_k: string, d: unknown) => d }, cache: { get: async () => undefined, set: async () => {} }, events: { emit: () => {}, on: () => {}, off: () => {} } },
    budget: { maxRetries: 3, allowReasoning: false, allowNetwork: false, allowDisk: true, mode: 'BALANCED' },
    modePolicy: { allowedTiers: ['LOCAL_TOOL'], allowedExecutionModels: ['DETERMINISTIC'], skipHealthChecks: false, aggressiveCache: false, maxReasoningAttempts: 0, scoringWeights: { confidence: 0.6, cost: 0.2, latency: 0.1, reliability: 0.1 } },
    userContext: {},
    traceBuilder: { append: () => {}, build: () => ({ events: [], requestId: 'fs1' }) },
    cancellationToken: { isCancelled: false, onCancel: () => {} },
  } as unknown as ExecutionContext
}

describe('Filesystem skills', () => {
  it('WriteFileSkill writes content and ReadFileSkill reads it back', async () => {
    const filePath = path.join(os.tmpdir(), `aios-test-${Date.now()}.txt`)
    const content = 'Hello, Rohinik!'
    const writeCtx = makeCtx(content, filePath, 'write file')
    const writeOutcome = await new WriteFileSkill().execute(writeCtx, {})
    expect(writeOutcome.status).toBe('SUCCESS')
    const readCtx = makeCtx('', filePath, 'read file')
    const readOutcome = await new ReadFileSkill().execute(readCtx, {})
    expect(readOutcome.status).toBe('SUCCESS')
    expect(readOutcome.result).toBe(content)
  })

  it('ReadFileSkill returns FAILURE for missing file', async () => {
    const ctx = makeCtx('', '/nonexistent/path/file.txt', 'read file')
    const outcome = await new ReadFileSkill().execute(ctx, {})
    expect(outcome.status).toBe('FAILURE')
  })

  it('ReadFileSkill matches read file intent', () => {
    expect(new ReadFileSkill().metadata.matching!.matcher.match(makeCtx('', '/tmp/f', 'read file').request).matched).toBe(true)
  })

  it('WriteFileSkill matches write file intent', () => {
    expect(new WriteFileSkill().metadata.matching!.matcher.match(makeCtx('data', '/tmp/f', 'write file').request).matched).toBe(true)
  })
})
