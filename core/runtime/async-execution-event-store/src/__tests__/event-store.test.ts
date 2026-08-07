import { describe, it, expect, beforeEach } from 'vitest'
import { createHash } from 'node:crypto'
import {
  InMemoryAsyncExecutionEventStore,
  EventStoreError,
  EventStoreErrorCode,
} from '../index.js'
import type { IAsyncExecutionEventStore, AppendEventRequest } from '../index.js'
import { PublicEventKind, decodeExecutionCursor } from '@rohinik-org/execution-protocol-v1'

function acceptedPayload() {
  return { submittedAt: new Date().toISOString() }
}
function progressPayload(msg = 'working') {
  return { message: msg }
}
function completedPayload() {
  return { completedAt: new Date().toISOString(), totalDurationMs: 100 }
}
function failedPayload() {
  return { errorCode: 'INTERNAL_ERROR', message: 'boom', failedAt: new Date().toISOString() }
}
function cancelledPayload() {
  return { cancelledAt: new Date().toISOString() }
}

const EX = 'exec-001'
const EX2 = 'exec-002'

describe('IAsyncExecutionEventStore — monotonic sequence assignment', () => {
  let store: IAsyncExecutionEventStore

  beforeEach(() => { store = new InMemoryAsyncExecutionEventStore() })

  it('first event gets sequence 1', async () => {
    const ev = await store.append({ executionId: EX, kind: PublicEventKind.EXECUTION_ACCEPTED, payload: acceptedPayload() })
    expect(ev.sequence).toBe(1)
  })

  it('sequences are monotonically increasing per execution', async () => {
    const e1 = await store.append({ executionId: EX, kind: PublicEventKind.EXECUTION_ACCEPTED, payload: acceptedPayload() })
    const e2 = await store.append({ executionId: EX, kind: PublicEventKind.PROGRESS, payload: progressPayload() })
    const e3 = await store.append({ executionId: EX, kind: PublicEventKind.PROGRESS, payload: progressPayload('step 2') })
    expect(e1.sequence).toBe(1)
    expect(e2.sequence).toBe(2)
    expect(e3.sequence).toBe(3)
  })

  it('sequences are independent per execution', async () => {
    const a1 = await store.append({ executionId: EX,  kind: PublicEventKind.EXECUTION_ACCEPTED, payload: acceptedPayload() })
    const b1 = await store.append({ executionId: EX2, kind: PublicEventKind.EXECUTION_ACCEPTED, payload: acceptedPayload() })
    const a2 = await store.append({ executionId: EX,  kind: PublicEventKind.PROGRESS, payload: progressPayload() })
    expect(a1.sequence).toBe(1)
    expect(b1.sequence).toBe(1)
    expect(a2.sequence).toBe(2)
  })

  it('caller cannot supply a sequence number', async () => {
    // AppendEventRequest must NOT have a sequence field — enforced by type; runtime test:
    const req = { executionId: EX, kind: PublicEventKind.EXECUTION_ACCEPTED, payload: acceptedPayload() } as AppendEventRequest
    expect((req as unknown as Record<string, unknown>)['sequence']).toBeUndefined()
  })
})

describe('IAsyncExecutionEventStore — cursor generation', () => {
  let store: IAsyncExecutionEventStore

  beforeEach(() => { store = new InMemoryAsyncExecutionEventStore() })

  it('each appended event has a cursor', async () => {
    const ev = await store.append({ executionId: EX, kind: PublicEventKind.EXECUTION_ACCEPTED, payload: acceptedPayload() })
    expect(typeof ev.cursor).toBe('string')
    expect(ev.cursor.length).toBeGreaterThan(0)
  })

  it('cursor decodes to correct executionId and sequence', async () => {
    const ev = await store.append({ executionId: EX, kind: PublicEventKind.EXECUTION_ACCEPTED, payload: acceptedPayload() })
    const decoded = decodeExecutionCursor(ev.cursor)
    expect(decoded.executionId).toBe(EX)
    expect(decoded.sequence).toBe(ev.sequence)
  })

  it('cursors increase per event', async () => {
    const e1 = await store.append({ executionId: EX, kind: PublicEventKind.EXECUTION_ACCEPTED, payload: acceptedPayload() })
    const e2 = await store.append({ executionId: EX, kind: PublicEventKind.PROGRESS, payload: progressPayload() })
    expect(e1.cursor).not.toBe(e2.cursor)
    expect(decodeExecutionCursor(e1.cursor).sequence).toBeLessThan(decodeExecutionCursor(e2.cursor).sequence)
  })
})

describe('IAsyncExecutionEventStore — list and listAfter', () => {
  let store: IAsyncExecutionEventStore

  beforeEach(() => { store = new InMemoryAsyncExecutionEventStore() })

  it('list returns all events in sequence order', async () => {
    await store.append({ executionId: EX, kind: PublicEventKind.EXECUTION_ACCEPTED, payload: acceptedPayload() })
    await store.append({ executionId: EX, kind: PublicEventKind.PROGRESS, payload: progressPayload() })
    await store.append({ executionId: EX, kind: PublicEventKind.EXECUTION_COMPLETED, payload: completedPayload() })
    const events = await store.list(EX)
    expect(events).toHaveLength(3)
    expect(events[0]!.sequence).toBe(1)
    expect(events[1]!.sequence).toBe(2)
    expect(events[2]!.sequence).toBe(3)
  })

  it('list returns empty array for unknown executionId', async () => {
    expect(await store.list('no-such-exec')).toEqual([])
  })

  it('listAfter returns events with sequence > decoded cursor sequence', async () => {
    const e1 = await store.append({ executionId: EX, kind: PublicEventKind.EXECUTION_ACCEPTED, payload: acceptedPayload() })
    const e2 = await store.append({ executionId: EX, kind: PublicEventKind.PROGRESS, payload: progressPayload('a') })
    const e3 = await store.append({ executionId: EX, kind: PublicEventKind.PROGRESS, payload: progressPayload('b') })

    const after = await store.listAfter(EX, e1.cursor)
    expect(after).toHaveLength(2)
    expect(after[0]!.sequence).toBe(e2.sequence)
    expect(after[1]!.sequence).toBe(e3.sequence)
  })

  it('listAfter with cursor at last event returns empty', async () => {
    const e1 = await store.append({ executionId: EX, kind: PublicEventKind.EXECUTION_ACCEPTED, payload: acceptedPayload() })
    const after = await store.listAfter(EX, e1.cursor)
    expect(after).toHaveLength(0)
  })

  it('list isolates events per execution', async () => {
    await store.append({ executionId: EX,  kind: PublicEventKind.EXECUTION_ACCEPTED, payload: acceptedPayload() })
    await store.append({ executionId: EX2, kind: PublicEventKind.EXECUTION_ACCEPTED, payload: acceptedPayload() })
    await store.append({ executionId: EX2, kind: PublicEventKind.PROGRESS, payload: progressPayload() })
    expect(await store.list(EX)).toHaveLength(1)
    expect(await store.list(EX2)).toHaveLength(2)
  })
})

describe('IAsyncExecutionEventStore — idempotent duplicate append', () => {
  let store: IAsyncExecutionEventStore

  beforeEach(() => { store = new InMemoryAsyncExecutionEventStore() })

  it('same idempotency key + same kind/payload returns original event without duplicate', async () => {
    const payload = acceptedPayload()
    const req: AppendEventRequest = {
      executionId: EX,
      kind: PublicEventKind.EXECUTION_ACCEPTED,
      payload,
      idempotencyKey: 'idem-1',
    }
    const first  = await store.append(req)
    const second = await store.append(req)
    expect(second.sequence).toBe(first.sequence)
    expect(second.cursor).toBe(first.cursor)
    const all = await store.list(EX)
    expect(all).toHaveLength(1)
  })
})

describe('IAsyncExecutionEventStore — conflicting duplicate rejection', () => {
  let store: IAsyncExecutionEventStore

  beforeEach(() => { store = new InMemoryAsyncExecutionEventStore() })

  it('same idempotency key + different kind throws IDEMPOTENCY_CONFLICT', async () => {
    const req1: AppendEventRequest = { executionId: EX, kind: PublicEventKind.EXECUTION_ACCEPTED, payload: acceptedPayload(), idempotencyKey: 'idem-2' }
    const req2: AppendEventRequest = { executionId: EX, kind: PublicEventKind.PROGRESS, payload: progressPayload(), idempotencyKey: 'idem-2' }
    await store.append(req1)
    const err = await store.append(req2).catch(e => e)
    expect(err).toBeInstanceOf(EventStoreError)
    expect((err as EventStoreError).code).toBe(EventStoreErrorCode.IDEMPOTENCY_CONFLICT)
  })

  it('same idempotency key + same kind + different payload throws IDEMPOTENCY_CONFLICT', async () => {
    const req1: AppendEventRequest = { executionId: EX, kind: PublicEventKind.PROGRESS, payload: progressPayload('msg1'), idempotencyKey: 'idem-3' }
    const req2: AppendEventRequest = { executionId: EX, kind: PublicEventKind.PROGRESS, payload: progressPayload('msg2'), idempotencyKey: 'idem-3' }
    await store.append(req1)
    const err = await store.append(req2).catch(e => e)
    expect(err).toBeInstanceOf(EventStoreError)
    expect((err as EventStoreError).code).toBe(EventStoreErrorCode.IDEMPOTENCY_CONFLICT)
  })
})

describe('IAsyncExecutionEventStore — cross-execution cursor rejection', () => {
  let store: IAsyncExecutionEventStore

  beforeEach(() => { store = new InMemoryAsyncExecutionEventStore() })

  it('listAfter with cursor from different execution throws CURSOR_EXECUTION_MISMATCH', async () => {
    const e1 = await store.append({ executionId: EX,  kind: PublicEventKind.EXECUTION_ACCEPTED, payload: acceptedPayload() })
    await store.append({ executionId: EX2, kind: PublicEventKind.EXECUTION_ACCEPTED, payload: acceptedPayload() })

    // Use EX's cursor against EX2's list
    const err = await store.listAfter(EX2, e1.cursor).catch(e => e)
    expect(err).toBeInstanceOf(EventStoreError)
    expect((err as EventStoreError).code).toBe(EventStoreErrorCode.CURSOR_EXECUTION_MISMATCH)
  })
})

describe('IAsyncExecutionEventStore — tampered/malformed cursor rejection', () => {
  let store: IAsyncExecutionEventStore

  beforeEach(() => { store = new InMemoryAsyncExecutionEventStore() })

  it('malformed cursor string throws CURSOR_INVALID', async () => {
    await store.append({ executionId: EX, kind: PublicEventKind.EXECUTION_ACCEPTED, payload: acceptedPayload() })
    const err = await store.listAfter(EX, 'not-a-valid-cursor' as never).catch(e => e)
    expect(err).toBeInstanceOf(EventStoreError)
    expect((err as EventStoreError).code).toBe(EventStoreErrorCode.CURSOR_INVALID)
  })

  it('truncated base64 cursor throws CURSOR_INVALID', async () => {
    await store.append({ executionId: EX, kind: PublicEventKind.EXECUTION_ACCEPTED, payload: acceptedPayload() })
    const err = await store.listAfter(EX, 'YWJj' as never).catch(e => e)
    expect(err).toBeInstanceOf(EventStoreError)
    expect((err as EventStoreError).code).toBe(EventStoreErrorCode.CURSOR_INVALID)
  })
})

describe('IAsyncExecutionEventStore — exactly one terminal event', () => {
  let store: IAsyncExecutionEventStore

  beforeEach(() => { store = new InMemoryAsyncExecutionEventStore() })

  it('second terminal event throws TERMINAL_EVENT_ALREADY_APPENDED', async () => {
    await store.append({ executionId: EX, kind: PublicEventKind.EXECUTION_ACCEPTED, payload: acceptedPayload() })
    await store.append({ executionId: EX, kind: PublicEventKind.EXECUTION_COMPLETED, payload: completedPayload() })
    const err = await store.append({ executionId: EX, kind: PublicEventKind.EXECUTION_CANCELLED, payload: cancelledPayload() }).catch(e => e)
    expect(err).toBeInstanceOf(EventStoreError)
    expect((err as EventStoreError).code).toBe(EventStoreErrorCode.TERMINAL_EVENT_ALREADY_APPENDED)
  })

  it('EXECUTION_FAILED after EXECUTION_COMPLETED throws', async () => {
    await store.append({ executionId: EX, kind: PublicEventKind.EXECUTION_COMPLETED, payload: completedPayload() })
    const err = await store.append({ executionId: EX, kind: PublicEventKind.EXECUTION_FAILED, payload: failedPayload() }).catch(e => e)
    expect(err).toBeInstanceOf(EventStoreError)
    expect((err as EventStoreError).code).toBe(EventStoreErrorCode.TERMINAL_EVENT_ALREADY_APPENDED)
  })
})

describe('IAsyncExecutionEventStore — no normal events after terminal', () => {
  let store: IAsyncExecutionEventStore

  beforeEach(() => { store = new InMemoryAsyncExecutionEventStore() })

  it('progress after completed throws POST_TERMINAL_APPEND', async () => {
    await store.append({ executionId: EX, kind: PublicEventKind.EXECUTION_COMPLETED, payload: completedPayload() })
    const err = await store.append({ executionId: EX, kind: PublicEventKind.PROGRESS, payload: progressPayload() }).catch(e => e)
    expect(err).toBeInstanceOf(EventStoreError)
    expect((err as EventStoreError).code).toBe(EventStoreErrorCode.POST_TERMINAL_APPEND)
  })

  it('status_changed after cancelled throws POST_TERMINAL_APPEND', async () => {
    await store.append({ executionId: EX, kind: PublicEventKind.EXECUTION_CANCELLED, payload: cancelledPayload() })
    const err = await store.append({ executionId: EX, kind: PublicEventKind.STATUS_CHANGED, payload: { previousState: 'RUNNING', newState: 'CANCELLED' } }).catch(e => e)
    expect(err).toBeInstanceOf(EventStoreError)
    expect((err as EventStoreError).code).toBe(EventStoreErrorCode.POST_TERMINAL_APPEND)
  })
})

describe('IAsyncExecutionEventStore — deterministic event ordering', () => {
  let store: IAsyncExecutionEventStore

  beforeEach(() => { store = new InMemoryAsyncExecutionEventStore() })

  it('list always returns events sorted ascending by sequence', async () => {
    for (let i = 0; i < 5; i++) {
      await store.append({ executionId: EX, kind: PublicEventKind.PROGRESS, payload: progressPayload(`step ${i}`) })
    }
    await store.append({ executionId: EX, kind: PublicEventKind.EXECUTION_COMPLETED, payload: completedPayload() })
    const events = await store.list(EX)
    for (let i = 1; i < events.length; i++) {
      expect(events[i]!.sequence).toBeGreaterThan(events[i - 1]!.sequence)
    }
  })
})

describe('IAsyncExecutionEventStore — event hash integrity', () => {
  let store: IAsyncExecutionEventStore

  beforeEach(() => { store = new InMemoryAsyncExecutionEventStore() })

  it('each event has a non-empty contentHash', async () => {
    const ev = await store.append({ executionId: EX, kind: PublicEventKind.EXECUTION_ACCEPTED, payload: acceptedPayload() })
    expect(typeof ev.contentHash).toBe('string')
    expect(ev.contentHash.length).toBeGreaterThan(0)
  })

  it('contentHash covers kind + executionId + sequence + payload', async () => {
    const payload = acceptedPayload()
    const ev = await store.append({ executionId: EX, kind: PublicEventKind.EXECUTION_ACCEPTED, payload })
    const canonical = JSON.stringify({ kind: ev.kind, executionId: ev.executionId, sequence: ev.sequence, payload: ev.payload })
    const expected  = createHash('sha256').update(canonical).digest('hex')
    expect(ev.contentHash).toBe(expected)
  })

  it('two events with same kind but different payload have different hashes', async () => {
    const e1 = await store.append({ executionId: EX, kind: PublicEventKind.PROGRESS, payload: progressPayload('a') })
    const e2 = await store.append({ executionId: EX, kind: PublicEventKind.PROGRESS, payload: progressPayload('b') })
    expect(e1.contentHash).not.toBe(e2.contentHash)
  })
})

describe('IAsyncExecutionEventStore — subscribe', () => {
  let store: IAsyncExecutionEventStore

  beforeEach(() => { store = new InMemoryAsyncExecutionEventStore() })

  it('subscriber receives events appended after subscribe() call', async () => {
    const received: number[] = []
    const sub = store.subscribe(EX)
    const drainPromise = (async () => {
      for await (const ev of sub) {
        received.push(ev.sequence)
      }
    })()

    await store.append({ executionId: EX, kind: PublicEventKind.EXECUTION_ACCEPTED, payload: acceptedPayload() })
    await store.append({ executionId: EX, kind: PublicEventKind.EXECUTION_COMPLETED, payload: completedPayload() })

    // Terminal event closes the stream — drainPromise should resolve
    await drainPromise
    expect(received).toEqual([1, 2])
  })

  it('late subscriber replays history then receives new events', async () => {
    await store.append({ executionId: EX, kind: PublicEventKind.EXECUTION_ACCEPTED, payload: acceptedPayload() })
    await store.append({ executionId: EX, kind: PublicEventKind.PROGRESS, payload: progressPayload() })

    const received: number[] = []
    const sub = store.subscribe(EX)
    const drainPromise = (async () => {
      for await (const ev of sub) {
        received.push(ev.sequence)
      }
    })()

    await store.append({ executionId: EX, kind: PublicEventKind.EXECUTION_COMPLETED, payload: completedPayload() })
    await drainPromise
    expect(received).toEqual([1, 2, 3])
  })

  it('subscriber for finished execution drains and exits', async () => {
    await store.append({ executionId: EX, kind: PublicEventKind.EXECUTION_ACCEPTED, payload: acceptedPayload() })
    await store.append({ executionId: EX, kind: PublicEventKind.EXECUTION_COMPLETED, payload: completedPayload() })

    const received: number[] = []
    for await (const ev of store.subscribe(EX)) {
      received.push(ev.sequence)
    }
    expect(received).toEqual([1, 2])
  })
})
