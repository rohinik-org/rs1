import { describe, it, expect } from 'vitest'
import { ExecutionEventBus } from '../journal/execution-event-bus.js'
import type { ExecutionJournalEntry } from '@rohinik-org/compiler'

function makeEntry(eventType: ExecutionJournalEntry['eventType']): ExecutionJournalEntry {
  return {
    executionId: 'exec-1',
    executionRevision: 1,
    timestamp: new Date().toISOString(),
    eventType,
  }
}

describe('ExecutionEventBus', () => {
  it('emits events to subscribers', async () => {
    const bus = new ExecutionEventBus('plan-1')
    const received: string[] = []
    const iter = bus.subscribe()
    const drain = (async () => {
      for await (const ev of iter) {
        received.push(ev.eventType)
        if (received.length === 2) break
      }
    })()
    bus.emit(makeEntry('EXECUTION_STARTED'))
    bus.emit(makeEntry('STEP_STARTED'))
    await drain
    expect(received).toEqual(['EXECUTION_STARTED', 'STEP_STARTED'])
  })

  it('multiple subscribers each receive events', async () => {
    const bus = new ExecutionEventBus('plan-1')
    const r1: string[] = []
    const r2: string[] = []
    const i1 = bus.subscribe()
    const i2 = bus.subscribe()
    const d1 = (async () => { for await (const e of i1) { r1.push(e.eventType); if (r1.length === 1) break } })()
    const d2 = (async () => { for await (const e of i2) { r2.push(e.eventType); if (r2.length === 1) break } })()
    bus.emit(makeEntry('EXECUTION_STARTED'))
    await Promise.all([d1, d2])
    expect(r1).toEqual(['EXECUTION_STARTED'])
    expect(r2).toEqual(['EXECUTION_STARTED'])
  })

  it('close() ends all subscriber iterables', async () => {
    const bus = new ExecutionEventBus('plan-1')
    const received: string[] = []
    const iter = bus.subscribe()
    const drain = (async () => {
      for await (const ev of iter) {
        received.push(ev.eventType)
      }
    })()
    bus.emit(makeEntry('EXECUTION_STARTED'))
    bus.close()
    await drain
    expect(received).toEqual(['EXECUTION_STARTED'])
  })
})
