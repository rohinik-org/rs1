import { describe, it, expect } from 'vitest'
import type { DecisionEvent, DecisionTrace } from '../trace.js'

describe('EXECUTION_RECORD_READY event', () => {
  it('is a valid DecisionEvent variant', () => {
    const trace: DecisionTrace = {
      requestId: 'req-001',
      events: [],
      reasoningInvoked: false,
    }
    const event: DecisionEvent = {
      type: 'EXECUTION_RECORD_READY',
      version: 1,
      requestId: 'req-001',
      timestamp: new Date(),
      trace,
      totalLatencyMs: 42,
    }
    expect(event.type).toBe('EXECUTION_RECORD_READY')
    if (event.type === 'EXECUTION_RECORD_READY') {
      expect(event.trace.requestId).toBe('req-001')
      expect(event.totalLatencyMs).toBe(42)
    }
  })

  it('accepts optional cost and token fields', () => {
    const event: DecisionEvent = {
      type: 'EXECUTION_RECORD_READY',
      version: 1,
      requestId: 'req-002',
      timestamp: new Date(),
      trace: { requestId: 'req-002', events: [], reasoningInvoked: true },
      totalLatencyMs: 850,
      estimatedCostUsd: 0.003,
      tokensUsed: 600,
    }
    if (event.type === 'EXECUTION_RECORD_READY') {
      expect(event.estimatedCostUsd).toBe(0.003)
    }
  })
})
