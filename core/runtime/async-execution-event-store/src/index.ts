import { createHash } from 'node:crypto'
import {
  PublicEventKind,
  PUBLIC_TERMINAL_EVENT_KINDS,
  encodeExecutionCursor,
  decodeExecutionCursor,
} from '@rohinik-org/execution-protocol-v1'
import type { ExecutionCursor } from '@rohinik-org/execution-protocol-v1'

// ── Error codes ───────────────────────────────────────────────────────────────

export const EventStoreErrorCode = Object.freeze({
  IDEMPOTENCY_CONFLICT:             'IDEMPOTENCY_CONFLICT',
  CURSOR_EXECUTION_MISMATCH:        'CURSOR_EXECUTION_MISMATCH',
  CURSOR_INVALID:                   'CURSOR_INVALID',
  TERMINAL_EVENT_ALREADY_APPENDED:  'TERMINAL_EVENT_ALREADY_APPENDED',
  POST_TERMINAL_APPEND:             'POST_TERMINAL_APPEND',
} as const)
export type EventStoreErrorCode = typeof EventStoreErrorCode[keyof typeof EventStoreErrorCode]

export class EventStoreError extends Error {
  constructor(
    readonly code: EventStoreErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'EventStoreError'
  }
}

// ── Stored event — flat structure (not extending discriminated union) ─────────

export interface StoredExecutionEvent {
  readonly kind: PublicEventKind
  readonly sequence: number
  readonly executionId: string
  readonly occurredAt: string
  readonly cursor: ExecutionCursor
  readonly payload: unknown
  readonly contentHash: string
}

// ── Append request — callers supply kind + payload only ───────────────────────

export interface AppendEventRequest {
  readonly executionId: string
  readonly kind: PublicEventKind
  readonly payload: unknown
  readonly idempotencyKey?: string
}

// ── Store interface ───────────────────────────────────────────────────────────

export interface IAsyncExecutionEventStore {
  /**
   * Append an event. Assigns sequence and cursor. Enforces append-only invariants.
   * Callers must NOT supply sequence or cursor — these are store-owned.
   */
  append(request: AppendEventRequest): Promise<StoredExecutionEvent>

  /** All events for executionId in ascending sequence order. */
  list(executionId: string): Promise<readonly StoredExecutionEvent[]>

  /**
   * Events for executionId with sequence > the sequence encoded in cursor.
   * Throws CURSOR_EXECUTION_MISMATCH if cursor belongs to a different execution.
   * Throws CURSOR_INVALID if cursor is malformed.
   */
  listAfter(executionId: string, cursor: ExecutionCursor | string): Promise<readonly StoredExecutionEvent[]>

  /**
   * Async iterable that yields events as they are appended, replaying history
   * for late subscribers. Completes when a terminal event is appended.
   */
  subscribe(executionId: string): AsyncIterable<StoredExecutionEvent>
}

// ── Canonical content hash ────────────────────────────────────────────────────

function computeContentHash(kind: string, executionId: string, sequence: number, payload: unknown): string {
  const canonical = JSON.stringify({ kind, executionId, sequence, payload })
  return createHash('sha256').update(canonical).digest('hex')
}

// ── Idempotency key → stored event fingerprint ────────────────────────────────

interface IdempotencyRecord {
  readonly kind: string
  readonly payloadHash: string
  readonly event: StoredExecutionEvent
}

function payloadHash(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex')
}

// ── Cursor validation ─────────────────────────────────────────────────────────

function parseCursor(cursor: string): { executionId: string; sequence: number } {
  try {
    const decoded = decodeExecutionCursor(cursor)
    if (!decoded.executionId || isNaN(decoded.sequence)) {
      throw new EventStoreError(EventStoreErrorCode.CURSOR_INVALID, `Invalid cursor: ${cursor}`)
    }
    return decoded
  } catch (err) {
    if (err instanceof EventStoreError) throw err
    throw new EventStoreError(EventStoreErrorCode.CURSOR_INVALID, `Malformed cursor: ${cursor}`)
  }
}

// ── In-memory implementation ──────────────────────────────────────────────────

export class InMemoryAsyncExecutionEventStore implements IAsyncExecutionEventStore {
  // executionId → ordered array of stored events
  private readonly events = new Map<string, StoredExecutionEvent[]>()
  // executionId → next sequence number
  private readonly sequences = new Map<string, number>()
  // executionId → terminal reached flag
  private readonly terminated = new Map<string, boolean>()
  // `${executionId}:${idempotencyKey}` → idempotency record
  private readonly idempotencyIndex = new Map<string, IdempotencyRecord>()
  // executionId → live subscriber push functions
  private readonly subscribers = new Map<string, Array<(ev: StoredExecutionEvent | null) => void>>()

  async append(request: AppendEventRequest): Promise<StoredExecutionEvent> {
    const { executionId, kind, payload, idempotencyKey } = request

    // ── Idempotency check ─────────────────────────────────────────────────────
    if (idempotencyKey !== undefined) {
      const idemKey = `${executionId}:${idempotencyKey}`
      const existing = this.idempotencyIndex.get(idemKey)
      if (existing !== undefined) {
        const incomingPayloadHash = payloadHash(payload)
        if (existing.kind !== kind || existing.payloadHash !== incomingPayloadHash) {
          throw new EventStoreError(
            EventStoreErrorCode.IDEMPOTENCY_CONFLICT,
            `Idempotency key '${idempotencyKey}' already used with different kind/payload`,
          )
        }
        return existing.event
      }
    }

    // ── Terminal guard ────────────────────────────────────────────────────────
    if (this.terminated.get(executionId)) {
      if (PUBLIC_TERMINAL_EVENT_KINDS.has(kind)) {
        throw new EventStoreError(
          EventStoreErrorCode.TERMINAL_EVENT_ALREADY_APPENDED,
          `Execution '${executionId}' already has a terminal event`,
        )
      }
      throw new EventStoreError(
        EventStoreErrorCode.POST_TERMINAL_APPEND,
        `Execution '${executionId}' is terminal — no further events allowed`,
      )
    }

    // ── Assign sequence and cursor ────────────────────────────────────────────
    const sequence = (this.sequences.get(executionId) ?? 0) + 1
    this.sequences.set(executionId, sequence)
    const cursor = encodeExecutionCursor(executionId, sequence)
    const contentHash = computeContentHash(kind, executionId, sequence, payload)

    const event = Object.freeze({
      kind,
      sequence,
      executionId,
      occurredAt: new Date().toISOString(),
      cursor,
      payload,
      contentHash,
    }) as StoredExecutionEvent

    // ── Persist ───────────────────────────────────────────────────────────────
    const list = this.events.get(executionId) ?? []
    list.push(event)
    this.events.set(executionId, list)

    if (PUBLIC_TERMINAL_EVENT_KINDS.has(kind)) {
      this.terminated.set(executionId, true)
    }

    // ── Idempotency index ─────────────────────────────────────────────────────
    if (idempotencyKey !== undefined) {
      const idemKey = `${executionId}:${idempotencyKey}`
      this.idempotencyIndex.set(idemKey, { kind, payloadHash: payloadHash(payload), event })
    }

    // ── Notify subscribers ────────────────────────────────────────────────────
    const subs = this.subscribers.get(executionId)
    if (subs) {
      for (const push of subs) push(event)
      if (this.terminated.get(executionId)) {
        for (const push of subs) push(null)
        this.subscribers.delete(executionId)
      }
    }

    return event
  }

  async list(executionId: string): Promise<readonly StoredExecutionEvent[]> {
    return [...(this.events.get(executionId) ?? [])]
  }

  async listAfter(executionId: string, cursor: ExecutionCursor | string): Promise<readonly StoredExecutionEvent[]> {
    const decoded = parseCursor(cursor)

    if (decoded.executionId !== executionId) {
      throw new EventStoreError(
        EventStoreErrorCode.CURSOR_EXECUTION_MISMATCH,
        `Cursor belongs to execution '${decoded.executionId}', not '${executionId}'`,
      )
    }

    const all = this.events.get(executionId) ?? []
    return all.filter(ev => ev.sequence > decoded.sequence)
  }

  subscribe(executionId: string): AsyncIterable<StoredExecutionEvent> {
    // Snapshot history at subscribe time so late subscribers replay it
    const history = [...(this.events.get(executionId) ?? [])]
    const alreadyTerminated = this.terminated.get(executionId) === true

    const queue: Array<StoredExecutionEvent | null> = [...history]
    if (alreadyTerminated) queue.push(null)

    let notify: (() => void) | null = null

    const push = (ev: StoredExecutionEvent | null) => {
      queue.push(ev)
      notify?.()
    }

    if (!alreadyTerminated) {
      const subs = this.subscribers.get(executionId) ?? []
      subs.push(push)
      this.subscribers.set(executionId, subs)
    }

    return {
      [Symbol.asyncIterator]() {
        return {
          async next(): Promise<IteratorResult<StoredExecutionEvent>> {
            while (queue.length === 0) {
              await new Promise<void>(r => { notify = r })
              notify = null
            }
            const item = queue.shift()!
            if (item === null) return { done: true, value: undefined as never }
            return { done: false, value: item }
          },
        }
      },
    }
  }
}
