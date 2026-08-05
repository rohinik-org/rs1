import { describe, it, expect, vi } from 'vitest'
import { randomBytes } from 'node:crypto'
import type { ExperienceQuery, ExperienceQueryResult } from '@rohinik-org/experience-query-ir'
import type { ExperienceReader } from '@rohinik-org/experience-store-ir'
import {
  ExperienceQueryOrderField,
  QueryDirection,
  ExperienceProjection,
  QUERY_DEFAULT_LIMIT,
  QUERY_MAX_LIMIT,
  QUERY_MIN_LIMIT,
  type ExperienceQueryCursorPayload,
} from '@rohinik-org/experience-query-ir'
import type { ExperienceRecord } from '@rohinik-org/experience-ir'
import {
  ExperienceQueryValidator,
  ExperienceQueryNormalizer,
  ExperienceQueryCursorCodec,
  ExperienceQueryEngine,
  ExperienceQueryValidationError,
  ExperienceQueryIntegrityError,
  ExperienceQueryUnavailableError,
} from '../index.js'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function hex64(): string { return randomBytes(32).toString('hex') }

function makeMetaResult(count = 0): ExperienceQueryResult {
  return Object.freeze({ items: Object.freeze([]), snapshotAt: new Date(), returnedCount: count })
}

function makeMockReader(overrides?: Partial<ExperienceReader>): ExperienceReader {
  return {
    query: vi.fn().mockResolvedValue(makeMetaResult()),
    getById: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

// ─── ExperienceQueryOrderField / QueryDirection / ExperienceProjection consts ─

describe('frozen consts', () => {
  it('ExperienceQueryOrderField is frozen', () => expect(Object.isFrozen(ExperienceQueryOrderField)).toBe(true))
  it('QueryDirection is frozen', () => expect(Object.isFrozen(QueryDirection)).toBe(true))
  it('ExperienceProjection is frozen', () => expect(Object.isFrozen(ExperienceProjection)).toBe(true))
})

// ─── ExperienceQueryNormalizer ────────────────────────────────────────────────

describe('ExperienceQueryNormalizer', () => {
  const n = new ExperienceQueryNormalizer()

  it('applies default limit', () => {
    const r = n.normalize({})
    expect(r.page.limit).toBe(QUERY_DEFAULT_LIMIT)
  })

  it('applies default order PRODUCED_AT DESC', () => {
    const r = n.normalize({})
    expect(r.order.field).toBe(ExperienceQueryOrderField.PRODUCED_AT)
    expect(r.order.direction).toBe(QueryDirection.DESC)
  })

  it('applies default projection METADATA', () => {
    const r = n.normalize({})
    expect(r.projection).toBe(ExperienceProjection.METADATA)
  })

  it('sorts experienceIds and deduplicates', () => {
    const r = n.normalize({ filter: { experienceIds: ['b', 'a', 'a'] } })
    expect(r.filter.experienceIds).toEqual(['a', 'b'])
  })

  it('sorts evaluationRecordIds and deduplicates', () => {
    const r = n.normalize({ filter: { evaluationRecordIds: ['z', 'a', 'a'] } })
    expect(r.filter.evaluationRecordIds).toEqual(['a', 'z'])
  })

  it('preserves provided limit', () => {
    const r = n.normalize({ page: { limit: 100 } })
    expect(r.page.limit).toBe(100)
  })

  it('result is deeply frozen', () => {
    const r = n.normalize({})
    expect(Object.isFrozen(r)).toBe(true)
    expect(Object.isFrozen(r.filter)).toBe(true)
    expect(Object.isFrozen(r.order)).toBe(true)
    expect(Object.isFrozen(r.page)).toBe(true)
  })

  it('equivalent queries produce same canonical representation', () => {
    const a = n.normalize({ filter: { experienceIds: ['b', 'a'] } })
    const b = n.normalize({ filter: { experienceIds: ['a', 'b'] } })
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('normalizes dates in filter (preserves Date objects)', () => {
    const from = new Date('2026-07-01T00:00:00Z')
    const r = n.normalize({ filter: { producedAt: { from } } })
    expect(r.filter.producedAt?.from).toBeInstanceOf(Date)
  })
})

// ─── ExperienceQueryValidator ─────────────────────────────────────────────────

describe('ExperienceQueryValidator', () => {
  const v = new ExperienceQueryValidator()

  it('accepts empty query', () => expect(() => v.validate({})).not.toThrow())

  it('accepts limit at min', () => expect(() => v.validate({ page: { limit: QUERY_MIN_LIMIT } })).not.toThrow())
  it('accepts limit at max', () => expect(() => v.validate({ page: { limit: QUERY_MAX_LIMIT } })).not.toThrow())
  it('rejects limit below min', () => expect(() => v.validate({ page: { limit: 0 } })).toThrow(ExperienceQueryValidationError))
  it('rejects limit above max', () => expect(() => v.validate({ page: { limit: 201 } })).toThrow(ExperienceQueryValidationError))
  it('rejects non-integer limit', () => expect(() => v.validate({ page: { limit: 1.5 } })).toThrow(ExperienceQueryValidationError))

  it('accepts valid 64-char intentHash', () => {
    expect(() => v.validate({ filter: { intentHash: hex64() } })).not.toThrow()
  })

  it('rejects short intentHash', () => {
    expect(() => v.validate({ filter: { intentHash: 'abc' } })).toThrow(ExperienceQueryValidationError)
  })

  it('rejects non-hex intentHash', () => {
    expect(() => v.validate({ filter: { intentHash: 'z'.repeat(64) } })).toThrow(ExperienceQueryValidationError)
  })

  it('rejects short capabilityHash', () => {
    expect(() => v.validate({ filter: { capabilityHash: 'bad' } })).toThrow(ExperienceQueryValidationError)
  })

  it('rejects short planHash', () => {
    expect(() => v.validate({ filter: { planHash: 'bad' } })).toThrow(ExperienceQueryValidationError)
  })

  it('rejects short policyFingerprint', () => {
    expect(() => v.validate({ filter: { policyFingerprint: 'bad' } })).toThrow(ExperienceQueryValidationError)
  })

  it('rejects invalid producedAt range (from >= to)', () => {
    const from = new Date('2026-08-01')
    const to = new Date('2026-07-01')
    expect(() => v.validate({ filter: { producedAt: { from, to } } })).toThrow(ExperienceQueryValidationError)
  })

  it('accepts valid producedAt range (from < to)', () => {
    const from = new Date('2026-07-01')
    const to = new Date('2026-08-01')
    expect(() => v.validate({ filter: { producedAt: { from, to } } })).not.toThrow()
  })

  it('rejects invalid storedAt range', () => {
    const from = new Date('2026-08-01')
    const to = new Date('2026-07-01')
    expect(() => v.validate({ filter: { storedAt: { from, to } } })).toThrow(ExperienceQueryValidationError)
  })

  it('rejects oversized experienceIds', () => {
    const ids = Array.from({ length: 201 }, (_, i) => String(i))
    expect(() => v.validate({ filter: { experienceIds: ids } })).toThrow(ExperienceQueryValidationError)
  })

  it('rejects oversized evaluationRecordIds', () => {
    const ids = Array.from({ length: 201 }, (_, i) => String(i))
    expect(() => v.validate({ filter: { evaluationRecordIds: ids } })).toThrow(ExperienceQueryValidationError)
  })
})

// ─── ExperienceQueryCursorCodec ───────────────────────────────────────────────

describe('ExperienceQueryCursorCodec', () => {
  const codec = new ExperienceQueryCursorCodec()
  const queryHash = hex64()

  function makeCursor(): ExperienceQueryCursorPayload {
    return {
      version: '1',
      queryHash,
      snapshotAt: new Date('2026-07-22T10:00:00Z').toISOString(),
      orderField: ExperienceQueryOrderField.PRODUCED_AT,
      direction: QueryDirection.DESC,
      lastSortValue: '2026-07-22T09:00:00.000Z',
      lastExperienceId: hex64(),
    }
  }

  it('encode/decode round-trip', () => {
    const cursor = makeCursor()
    const encoded = codec.encode(cursor)
    const decoded = codec.decode(encoded, queryHash)
    expect(decoded).toEqual(cursor)
  })

  it('decoded snapshotAt preserved', () => {
    const cursor = makeCursor()
    const decoded = codec.decode(codec.encode(cursor), queryHash)
    expect(decoded.snapshotAt).toBe(cursor.snapshotAt)
  })

  it('decoded tie-breaker preserved', () => {
    const cursor = makeCursor()
    const decoded = codec.decode(codec.encode(cursor), queryHash)
    expect(decoded.lastExperienceId).toBe(cursor.lastExperienceId)
  })

  it('rejects malformed cursor', () => {
    expect(() => codec.decode('!!!notbase64url', queryHash)).toThrow(ExperienceQueryValidationError)
  })

  it('rejects wrong version', () => {
    const bad = { ...makeCursor(), version: '2' as never }
    expect(() => codec.decode(codec.encode(bad), queryHash)).toThrow(ExperienceQueryValidationError)
  })

  it('rejects query hash mismatch', () => {
    const encoded = codec.encode(makeCursor())
    expect(() => codec.decode(encoded, hex64())).toThrow(ExperienceQueryValidationError)
  })

  it('encoded is base64url (no + / = chars)', () => {
    const encoded = codec.encode(makeCursor())
    expect(encoded).not.toMatch(/[+/=]/)
  })
})

// ─── ExperienceQueryEngine ────────────────────────────────────────────────────

describe('ExperienceQueryEngine', () => {
  function makeEngine(readerOverrides?: Partial<ExperienceReader>) {
    const reader = makeMockReader(readerOverrides)
    const engine = new ExperienceQueryEngine(
      new ExperienceQueryValidator(),
      new ExperienceQueryNormalizer(),
      reader,
    )
    return { engine, reader }
  }

  it('calls reader.query after validate + normalize', async () => {
    const { engine, reader } = makeEngine()
    await engine.query({})
    expect(reader.query).toHaveBeenCalledOnce()
  })

  it('returns reader result', async () => {
    const result = makeMetaResult(3)
    const { engine } = makeEngine({ query: vi.fn().mockResolvedValue(result) })
    const r = await engine.query({})
    expect(r.returnedCount).toBe(3)
  })

  it('rejects invalid query with ExperienceQueryValidationError', async () => {
    const { engine } = makeEngine()
    await expect(engine.query({ page: { limit: 0 } })).rejects.toThrow(ExperienceQueryValidationError)
  })

  it('passes normalized query to reader', async () => {
    const { engine, reader } = makeEngine()
    await engine.query({ filter: { experienceIds: ['b', 'a'] } })
    const arg = (reader.query as ReturnType<typeof vi.fn>).mock.calls[0]![0] as ExperienceQuery
    expect((arg.filter as { experienceIds: string[] }).experienceIds).toEqual(['a', 'b'])
  })

  it('delegates getById to reader', async () => {
    const { engine, reader } = makeEngine()
    await engine.getById('abc')
    expect(reader.getById).toHaveBeenCalledWith('abc')
  })

  it('returns undefined for missing record', async () => {
    const { engine } = makeEngine()
    const r = await engine.getById('missing')
    expect(r).toBeUndefined()
  })

  it('records telemetry when sink provided', async () => {
    const sink = { record: vi.fn() }
    const reader = makeMockReader()
    const engine = new ExperienceQueryEngine(
      new ExperienceQueryValidator(),
      new ExperienceQueryNormalizer(),
      reader,
      sink,
    )
    await engine.query({})
    expect(sink.record).toHaveBeenCalledOnce()
  })

  it('telemetry does not contain full record payloads', async () => {
    const sink = { record: vi.fn() }
    const reader = makeMockReader()
    const engine = new ExperienceQueryEngine(
      new ExperienceQueryValidator(),
      new ExperienceQueryNormalizer(),
      reader,
      sink,
    )
    await engine.query({})
    const telemetry = sink.record.mock.calls[0][0] as Record<string, unknown>
    expect(telemetry).not.toHaveProperty('items')
    expect(telemetry).not.toHaveProperty('payload')
  })

  it('maps reader failure through to caller', async () => {
    const { engine } = makeEngine({
      query: vi.fn().mockRejectedValue(new ExperienceQueryUnavailableError('closed')),
    })
    await expect(engine.query({})).rejects.toThrow(ExperienceQueryUnavailableError)
  })

  it('maps integrity error through to caller', async () => {
    const { engine } = makeEngine({
      query: vi.fn().mockRejectedValue(new ExperienceQueryIntegrityError('mismatch')),
    })
    await expect(engine.query({})).rejects.toThrow(ExperienceQueryIntegrityError)
  })
})

// ─── Error class sanity ────────────────────────────────────────────────────────

describe('error classes', () => {
  it('ExperienceQueryValidationError has correct name', () => {
    expect(new ExperienceQueryValidationError('x').name).toBe('ExperienceQueryValidationError')
  })
  it('ExperienceQueryIntegrityError has correct name', () => {
    expect(new ExperienceQueryIntegrityError('x').name).toBe('ExperienceQueryIntegrityError')
  })
  it('ExperienceQueryUnavailableError has correct name', () => {
    expect(new ExperienceQueryUnavailableError('x').name).toBe('ExperienceQueryUnavailableError')
  })
})
