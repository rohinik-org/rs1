import { describe, it, expect } from 'vitest'
import { MetadataEnricher } from '../metadata-enricher.js'
import type { DriverRawEvent } from '../driver-raw-event.js'
import type { ExecutionContext } from '../execution-context.js'

function makeContext(overrides: Partial<ExecutionContext> = {}): ExecutionContext {
  return {
    requestId: 'req-1',
    executionId: 'exec-1',
    sessionId: 'sess-1',
    workspaceId: 'ws-1',
    permissions: [],
    ...overrides,
  }
}

async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = []
  for await (const item of iter) out.push(item)
  return out
}

async function* toAsync<T>(items: T[]): AsyncGenerator<T> {
  for (const item of items) yield item
}

describe('MetadataEnricher', () => {
  it('enriched stream has sequence 1, 2, 3 on every event', async () => {
    const enricher = new MetadataEnricher()
    const events: DriverRawEvent<string>[] = [
      { type: 'STARTED', payload: {} },
      { type: 'RESULT', payload: 'ok' },
      { type: 'COMPLETE', payload: {} },
    ]
    const out = await collect(enricher.enrich(toAsync(events), makeContext(), 'test-driver'))
    expect(out[0]?.sequence).toBe(1)
    expect(out[1]?.sequence).toBe(2)
    expect(out[2]?.sequence).toBe(3)
  })

  it('enriched stream has requestId/executionId/driverId matching context', async () => {
    const enricher = new MetadataEnricher()
    const ctx = makeContext({ requestId: 'r-42', executionId: 'e-99' })
    const events: DriverRawEvent<string>[] = [{ type: 'STARTED', payload: {} }]
    const out = await collect(enricher.enrich(toAsync(events), ctx, 'my-drv'))
    expect(out[0]?.requestId).toBe('r-42')
    expect(out[0]?.executionId).toBe('e-99')
    expect(out[0]?.driverId).toBe('my-drv')
  })

  it('timestamps are Date objects >= test start time', async () => {
    const before = new Date()
    const enricher = new MetadataEnricher()
    const events: DriverRawEvent<string>[] = [{ type: 'STARTED', payload: {} }]
    const out = await collect(enricher.enrich(toAsync(events), makeContext(), 'drv'))
    expect(out[0]?.timestamp).toBeInstanceOf(Date)
    expect(out[0]!.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime())
  })

  it('injectable clock produces deterministic timestamps', async () => {
    const fixed = new Date('2026-01-01T00:00:00Z')
    const enricher = new MetadataEnricher({ now: () => fixed })
    const events: DriverRawEvent<string>[] = [
      { type: 'STARTED', payload: {} },
      { type: 'COMPLETE', payload: {} },
    ]
    const out = await collect(enricher.enrich(toAsync(events), makeContext(), 'drv'))
    expect(out[0]?.timestamp).toEqual(fixed)
    expect(out[1]?.timestamp).toEqual(fixed)
  })
})
