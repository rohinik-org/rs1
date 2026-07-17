import { describe, it, expect } from 'vitest'
import { ExecutionContextFactory } from '../context-factory.js'
import { DEFAULT_SYSTEM_CONFIG } from '../domain/config.js'
import { createRuntimeServices } from '../services/index.js'

const services = createRuntimeServices(DEFAULT_SYSTEM_CONFIG)
const factory = new ExecutionContextFactory(DEFAULT_SYSTEM_CONFIG, services)

describe('ExecutionContextFactory', () => {
  it('creates context with expanded modePolicy', () => {
    const ctx = factory.create({
      id: 'req-1',
      content: 'parse csv',
      contentType: 'CSV',
      context: {},
      metadata: {},
      constraints: { maxRetries: 3, allowReasoning: true, allowNetwork: true, allowDisk: true, mode: 'BALANCED' },
      timestamp: new Date(),
    })
    expect(ctx.modePolicy.allowedTiers).toContain('DETERMINISTIC')
    expect(ctx.budget.mode).toBe('BALANCED')
  })

  it('STRICT mode policy excludes REASONING tier', () => {
    const ctx = factory.create({
      id: 'req-2',
      content: 'anything',
      contentType: 'TEXT',
      context: {},
      metadata: {},
      constraints: { maxRetries: 3, allowReasoning: true, allowNetwork: true, allowDisk: true, mode: 'STRICT' },
      timestamp: new Date(),
    })
    expect(ctx.modePolicy.allowedTiers).not.toContain('REASONING')
    expect(ctx.modePolicy.maxReasoningAttempts).toBe(0)
  })

  it('cancellationToken starts uncancelled', () => {
    const ctx = factory.create({
      id: 'req-3', content: 'x', contentType: 'TEXT',
      context: {}, metadata: {},
      constraints: { maxRetries: 1, allowReasoning: true, allowNetwork: true, allowDisk: true, mode: 'BALANCED' },
      timestamp: new Date(),
    })
    expect(ctx.cancellationToken.isCancelled).toBe(false)
  })
})
