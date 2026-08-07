import { describe, it, expect } from 'vitest'
import {
  PublicEventKind,
  PUBLIC_TERMINAL_EVENT_KINDS,
  decodeExecutionCursor,
  encodeExecutionCursor,
  EVENT_SCHEMAS,
} from '../events.js'

describe('PublicEventKind', () => {
  it('defines all 12 canonical event kinds', () => {
    const kinds = Object.values(PublicEventKind)
    expect(kinds).toHaveLength(12)
    expect(kinds).toContain('EXECUTION_ACCEPTED')
    expect(kinds).toContain('EXECUTION_ADMITTED')
    expect(kinds).toContain('EXECUTION_STARTED')
    expect(kinds).toContain('STATUS_CHANGED')
    expect(kinds).toContain('PROGRESS')
    expect(kinds).toContain('PARTIAL_OUTPUT')
    expect(kinds).toContain('USAGE_OBSERVED')
    expect(kinds).toContain('WAITING')
    expect(kinds).toContain('CANCELLATION_REQUESTED')
    expect(kinds).toContain('EXECUTION_COMPLETED')
    expect(kinds).toContain('EXECUTION_FAILED')
    expect(kinds).toContain('EXECUTION_CANCELLED')
  })

  it('is frozen', () => {
    expect(Object.isFrozen(PublicEventKind)).toBe(true)
  })
})

describe('PUBLIC_TERMINAL_EVENT_KINDS', () => {
  it('contains exactly the three terminal kinds', () => {
    expect(PUBLIC_TERMINAL_EVENT_KINDS.has('EXECUTION_COMPLETED')).toBe(true)
    expect(PUBLIC_TERMINAL_EVENT_KINDS.has('EXECUTION_FAILED')).toBe(true)
    expect(PUBLIC_TERMINAL_EVENT_KINDS.has('EXECUTION_CANCELLED')).toBe(true)
    expect(PUBLIC_TERMINAL_EVENT_KINDS.size).toBe(3)
  })

  it('does not include non-terminal kinds', () => {
    expect(PUBLIC_TERMINAL_EVENT_KINDS.has('EXECUTION_ACCEPTED')).toBe(false)
    expect(PUBLIC_TERMINAL_EVENT_KINDS.has('STATUS_CHANGED')).toBe(false)
    expect(PUBLIC_TERMINAL_EVENT_KINDS.has('PARTIAL_OUTPUT')).toBe(false)
  })
})

describe('ExecutionCursor encode/decode', () => {
  it('round-trips executionId and sequence', () => {
    const cursor = encodeExecutionCursor('exec-abc-123', 5)
    const decoded = decodeExecutionCursor(cursor)
    expect(decoded.executionId).toBe('exec-abc-123')
    expect(decoded.sequence).toBe(5)
  })

  it('cursor string is opaque (not plaintext)', () => {
    const cursor = encodeExecutionCursor('exec-abc-123', 5)
    expect(cursor).not.toContain('exec-abc-123')
    expect(typeof cursor).toBe('string')
  })

  it('sequence 0 round-trips', () => {
    const cursor = encodeExecutionCursor('x', 0)
    expect(decodeExecutionCursor(cursor).sequence).toBe(0)
  })

  it('large sequence round-trips', () => {
    const cursor = encodeExecutionCursor('exec-z', 99_999)
    expect(decodeExecutionCursor(cursor).sequence).toBe(99_999)
  })

  it('different sequences produce different cursors', () => {
    const a = encodeExecutionCursor('exec-1', 1)
    const b = encodeExecutionCursor('exec-1', 2)
    expect(a).not.toBe(b)
  })
})

describe('EVENT_SCHEMAS', () => {
  it('exports 13 schemas (envelope + 12 payloads)', () => {
    expect(EVENT_SCHEMAS).toHaveLength(13)
  })

  it('all schemas have $id starting with event-protocol/v1/', () => {
    for (const s of EVENT_SCHEMAS) {
      expect(s.$id).toMatch(/^https:\/\/rohinik\.org\/schemas\/execution-protocol\/v1\/events\//)
    }
  })

  it('all schemas have additionalProperties: false', () => {
    for (const s of EVENT_SCHEMAS) {
      expect((s as Record<string, unknown>)['additionalProperties']).toBe(false)
    }
  })

  it('EXECUTION_ENVELOPE schema requires kind, sequence, executionId, occurredAt, payload', () => {
    const envelope = EVENT_SCHEMAS.find(s => s.title === 'ExecutionEventEnvelope')
    expect(envelope?.required).toContain('kind')
    expect(envelope?.required).toContain('sequence')
    expect(envelope?.required).toContain('executionId')
    expect(envelope?.required).toContain('occurredAt')
    expect(envelope?.required).toContain('payload')
  })

  it('PARTIAL_OUTPUT schema requires chunk and chunkIndex', () => {
    const schema = EVENT_SCHEMAS.find(s => s.title === 'PartialOutputPayload')
    expect(schema?.required).toContain('chunk')
    expect(schema?.required).toContain('chunkIndex')
  })

  it('EXECUTION_FAILED schema requires errorCode', () => {
    const schema = EVENT_SCHEMAS.find(s => s.title === 'ExecutionFailedPayload')
    expect(schema?.required).toContain('errorCode')
  })
})
