import { describe, it, expect } from 'vitest'
import { DefaultDecisionTraceBuilder } from '../trace-builder.js'

describe('DefaultDecisionTraceBuilder', () => {
  it('starts with no events', () => {
    const builder = new DefaultDecisionTraceBuilder('req-1')
    const trace = builder.build()
    expect(trace.requestId).toBe('req-1')
    expect(trace.events).toHaveLength(0)
  })

  it('appends events in order', () => {
    const builder = new DefaultDecisionTraceBuilder('req-2')
    builder.append({ version: 1, requestId: 'req-2', timestamp: new Date(), type: 'TIER_STARTED', tierId: 'DETERMINISTIC' })
    builder.append({ version: 1, requestId: 'req-2', timestamp: new Date(), type: 'TIER_STARTED', tierId: 'REASONING' })
    const trace = builder.build()
    expect(trace.events).toHaveLength(2)
    expect(trace.events[0]?.type).toBe('TIER_STARTED')
    expect((trace.events[1] as any).tierId).toBe('REASONING')
  })

  it('sets reasoningInvoked true when REASONING tier winner', () => {
    const builder = new DefaultDecisionTraceBuilder('req-3')
    builder.append({
      version: 1, requestId: 'req-3', timestamp: new Date(),
      type: 'COMPLETED', winnerTierId: 'REASONING', winnerSkillId: 'llm', reasoningInvoked: true,
    })
    const trace = builder.build()
    expect(trace.reasoningInvoked).toBe(true)
    expect(trace.winnerTierId).toBe('REASONING')
  })

  it('sets reasoningInvoked false when deterministic winner', () => {
    const builder = new DefaultDecisionTraceBuilder('req-4')
    builder.append({
      version: 1, requestId: 'req-4', timestamp: new Date(),
      type: 'COMPLETED', winnerTierId: 'DETERMINISTIC', winnerSkillId: 'csv', reasoningInvoked: false,
    })
    const trace = builder.build()
    expect(trace.reasoningInvoked).toBe(false)
  })

  it('build() returns immutable trace', () => {
    const builder = new DefaultDecisionTraceBuilder('req-5')
    const trace = builder.build()
    expect(() => (trace as any).events.push('x')).toThrow()
  })
})
