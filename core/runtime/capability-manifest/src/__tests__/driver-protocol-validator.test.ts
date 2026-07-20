import { describe, it, expect } from 'vitest'
import { DriverProtocolValidator } from '../driver-protocol-validator.js'
import type { DriverRawEvent } from '../driver-raw-event.js'

async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = []
  for await (const item of iter) out.push(item)
  return out
}

function stream<T>(events: DriverRawEvent<T>[]): AsyncIterable<DriverRawEvent<T>> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const e of events) yield e
    }
  }
}

describe('DriverProtocolValidator', () => {
  it('valid STARTED/OUTPUT/RESULT/COMPLETE passes through unchanged', async () => {
    const events: DriverRawEvent<string>[] = [
      { type: 'STARTED', payload: {} },
      { type: 'OUTPUT', payload: { text: 'hi', stream: 'stdout' } },
      { type: 'RESULT', payload: 'done' },
      { type: 'COMPLETE', payload: {} },
    ]
    const out = await collect(DriverProtocolValidator.validate(stream(events)))
    expect(out.map(e => e.type)).toEqual(['STARTED', 'OUTPUT', 'RESULT', 'COMPLETE'])
  })

  it('missing STARTED — synthetic STARTED injected as first event', async () => {
    const events: DriverRawEvent<string>[] = [
      { type: 'RESULT', payload: 'x' },
      { type: 'COMPLETE', payload: {} },
    ]
    const out = await collect(DriverProtocolValidator.validate(stream(events)))
    expect(out[0]?.type).toBe('STARTED')
    expect(out[1]?.type).toBe('RESULT')
    expect(out[2]?.type).toBe('COMPLETE')
  })

  it('second STARTED → ERROR PROTOCOL_VIOLATION, stream terminates', async () => {
    const events: DriverRawEvent<string>[] = [
      { type: 'STARTED', payload: {} },
      { type: 'STARTED', payload: {} },
    ]
    const out = await collect(DriverProtocolValidator.validate(stream(events)))
    const err = out.find(e => e.type === 'ERROR')
    expect(err).toBeDefined()
    expect((err?.payload as { code: string }).code).toBe('PROTOCOL_VIOLATION')
    // nothing after ERROR
    expect(out[out.length - 1]?.type).toBe('ERROR')
  })

  it('OUTPUT after COMPLETE → ERROR PROTOCOL_VIOLATION', async () => {
    const events: DriverRawEvent<string>[] = [
      { type: 'STARTED', payload: {} },
      { type: 'COMPLETE', payload: {} },
      { type: 'OUTPUT', payload: { text: 'late', stream: 'stdout' } },
    ]
    const out = await collect(DriverProtocolValidator.validate(stream(events)))
    // COMPLETE terminates — OUTPUT after it never emitted
    expect(out.some(e => e.type === 'OUTPUT')).toBe(false)
    expect(out.some(e => e.type === 'COMPLETE')).toBe(true)
  })

  it('ERROR after COMPLETE → stream terminated, second event not emitted', async () => {
    const events: DriverRawEvent<string>[] = [
      { type: 'STARTED', payload: {} },
      { type: 'COMPLETE', payload: {} },
      { type: 'ERROR', payload: { code: 'EXECUTION_FAILED', message: 'late', retryable: false } },
    ]
    const out = await collect(DriverProtocolValidator.validate(stream(events)))
    expect(out.filter(e => e.type === 'ERROR').length).toBe(0)
    expect(out.some(e => e.type === 'COMPLETE')).toBe(true)
  })

  it('second RESULT → ERROR PROTOCOL_VIOLATION', async () => {
    const events: DriverRawEvent<string>[] = [
      { type: 'STARTED', payload: {} },
      { type: 'RESULT', payload: 'first' },
      { type: 'RESULT', payload: 'second' },
    ]
    const out = await collect(DriverProtocolValidator.validate(stream(events)))
    const err = out.find(e => e.type === 'ERROR')
    expect(err).toBeDefined()
    expect((err?.payload as { code: string }).code).toBe('PROTOCOL_VIOLATION')
  })

  it('RESULT with undefined payload → ERROR PROTOCOL_VIOLATION', async () => {
    const events: DriverRawEvent<undefined>[] = [
      { type: 'STARTED', payload: {} },
      { type: 'RESULT', payload: undefined },
    ]
    const out = await collect(DriverProtocolValidator.validate(stream(events as DriverRawEvent[])))
    const err = out.find(e => e.type === 'ERROR')
    expect(err).toBeDefined()
    expect((err?.payload as { code: string }).code).toBe('PROTOCOL_VIOLATION')
  })

  it('PROGRESS with percent=101 → ERROR PROTOCOL_VIOLATION', async () => {
    const events: DriverRawEvent<never>[] = [
      { type: 'STARTED', payload: {} },
      { type: 'PROGRESS', payload: { percent: 101 } },
    ]
    const out = await collect(DriverProtocolValidator.validate(stream(events)))
    const err = out.find(e => e.type === 'ERROR')
    expect(err).toBeDefined()
    expect((err?.payload as { code: string }).code).toBe('PROTOCOL_VIOLATION')
  })

  it('PROGRESS with percent=-1 → ERROR PROTOCOL_VIOLATION', async () => {
    const events: DriverRawEvent<never>[] = [
      { type: 'STARTED', payload: {} },
      { type: 'PROGRESS', payload: { percent: -1 } },
    ]
    const out = await collect(DriverProtocolValidator.validate(stream(events)))
    expect(out.find(e => e.type === 'ERROR')).toBeDefined()
  })

  it('validator does NOT add sequence/timestamp/driverId', async () => {
    const events: DriverRawEvent<string>[] = [
      { type: 'STARTED', payload: {} },
      { type: 'COMPLETE', payload: {} },
    ]
    const out = await collect(DriverProtocolValidator.validate(stream(events)))
    expect((out[0] as Record<string, unknown>).sequence).toBeUndefined()
    expect((out[0] as Record<string, unknown>).timestamp).toBeUndefined()
    expect((out[0] as Record<string, unknown>).driverId).toBeUndefined()
  })
})
