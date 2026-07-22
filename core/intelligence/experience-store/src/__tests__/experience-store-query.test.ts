import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rmSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import type { ExperienceRecord } from '@rohinik-org/experience-ir'
import { ExperienceQueryIntegrityError, ExperienceQueryUnavailableError } from '@rohinik-org/experience-query'
import { ExperienceProjection, QueryDirection, ExperienceQueryOrderField } from '@rohinik-org/experience-query-ir'
import { LocalExperienceRepository } from '../index.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hex64(): string { return randomBytes(32).toString('hex') }

function tmpDbPath(): string {
  return join(tmpdir(), `exp-query-test-${randomBytes(4).toString('hex')}`, 'experience.db')
}

function makeRecord(overrides?: Partial<{
  producedAt: Date
  intentHash: string
  capabilityHash: string
  planHash: string
  policyFingerprint: string
  schemaVersion: string
  captureVersion: string
  evaluationRecordId: string
}>): ExperienceRecord {
  const id = hex64()
  const now = overrides?.producedAt ?? new Date()
  const intentHash = overrides?.intentHash ?? 'a'.repeat(64)
  const capabilityHash = overrides?.capabilityHash ?? 'b'.repeat(64)
  const planHash = overrides?.planHash ?? 'c'.repeat(64)
  const policyFingerprint = overrides?.policyFingerprint ?? 'd'.repeat(64)
  return Object.freeze({
    experienceId: id,
    evaluationRecordId: overrides?.evaluationRecordId ?? `eval-${randomBytes(4).toString('hex')}`,
    sessionId: 'session-1',
    executionId: 'exec-1',
    decisionId: 'decision-1',
    observedOutcome: Object.freeze({ finalState: 'COMPLETED' as const, totalDurationMs: 100, stepCount: 1, failedStepCount: 0, retryCount: 0 }),
    predictionComparison: Object.freeze({ latencyErrorMs: 0, latencyErrorPct: 0, failurePredicted: false, failureObserved: false, failurePredictionCorrect: true, topCapabilityHit: true, predictionConfidence: 0.9 }),
    planningComparison: Object.freeze({ planExecuted: true, planSucceeded: true, retriesOccurred: false, budgetRespected: true, decisionConfidence: 0.9, selectionMargin: 0.1, planningAlgorithmVersion: '1.0.0' }),
    executionComparison: Object.freeze({ completedSteps: 1, failedSteps: 0, cancelledSteps: 0, totalRetries: 0, durationMs: 100, stepSuccessRate: 1.0 }),
    scores: Object.freeze({ overallScore: 0.9, predictionAccuracy: 1.0, planningAccuracy: 1.0, executionEfficiency: 1.0 }),
    explanation: Object.freeze({ primaryReason: 'EXECUTION_SUCCESS' as const, notes: Object.freeze([]) }),
    fingerprint: Object.freeze({ experienceId: id, evaluationFingerprint: policyFingerprint, intentHash, capabilityHash, planHash }),
    metadata: Object.freeze({
      schemaVersion: overrides?.schemaVersion ?? '1.0.0',
      captureVersion: overrides?.captureVersion ?? '1.0.0',
      runtimeVersion: '0.1.0',
      hostId: 'host-1',
    }),
    telemetry: Object.freeze({ captureDurationMs: 5 }),
    producedAt: now,
  } as ExperienceRecord)
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

let repo: LocalExperienceRepository
let dbPath: string

beforeEach(async () => {
  dbPath = tmpDbPath()
  repo = new LocalExperienceRepository(dbPath)
  await repo.initialize()
})

afterEach(async () => {
  await repo.close()
  try { rmSync(join(dbPath, '..'), { recursive: true }) } catch { /* ok */ }
})

// ─── Filter tests — all 10 fields ────────────────────────────────────────────

describe('filter: experienceIds', () => {
  it('returns only matching ids', async () => {
    const r1 = makeRecord(); const r2 = makeRecord()
    await repo.append(r1); await repo.append(r2)
    const result = await repo.query({ filter: { experienceIds: [r1.experienceId] } })
    expect(result.returnedCount).toBe(1)
    expect((result.items[0] as { experienceId: string }).experienceId).toBe(r1.experienceId)
  })

  it('returns empty when no match', async () => {
    await repo.append(makeRecord())
    const result = await repo.query({ filter: { experienceIds: [hex64()] } })
    expect(result.returnedCount).toBe(0)
  })
})

describe('filter: evaluationRecordIds', () => {
  it('returns matching evaluation record', async () => {
    const evalId = `eval-${randomBytes(4).toString('hex')}`
    const r = makeRecord({ evaluationRecordId: evalId })
    await repo.append(r); await repo.append(makeRecord())
    const result = await repo.query({ filter: { evaluationRecordIds: [evalId] } })
    expect(result.returnedCount).toBe(1)
  })
})

describe('filter: intentHash', () => {
  it('returns only records with matching intentHash', async () => {
    const hash = 'e'.repeat(64)
    await repo.append(makeRecord({ intentHash: hash }))
    await repo.append(makeRecord({ intentHash: 'f'.repeat(64) }))
    const result = await repo.query({ filter: { intentHash: hash } })
    expect(result.returnedCount).toBe(1)
  })
})

describe('filter: capabilityHash', () => {
  it('filters by capabilityHash', async () => {
    const hash = '1'.repeat(64)
    await repo.append(makeRecord({ capabilityHash: hash }))
    await repo.append(makeRecord())
    const result = await repo.query({ filter: { capabilityHash: hash } })
    expect(result.returnedCount).toBe(1)
  })
})

describe('filter: planHash', () => {
  it('filters by planHash', async () => {
    const hash = '2'.repeat(64)
    await repo.append(makeRecord({ planHash: hash }))
    await repo.append(makeRecord())
    const result = await repo.query({ filter: { planHash: hash } })
    expect(result.returnedCount).toBe(1)
  })
})

describe('filter: policyFingerprint', () => {
  it('filters by policyFingerprint', async () => {
    const fp = '3'.repeat(64)
    await repo.append(makeRecord({ policyFingerprint: fp }))
    await repo.append(makeRecord())
    const result = await repo.query({ filter: { policyFingerprint: fp } })
    expect(result.returnedCount).toBe(1)
  })
})

describe('filter: schemaVersions', () => {
  it('filters by schemaVersions list', async () => {
    await repo.append(makeRecord({ schemaVersion: '2.0.0' }))
    await repo.append(makeRecord({ schemaVersion: '1.0.0' }))
    const result = await repo.query({ filter: { schemaVersions: ['2.0.0'] } })
    expect(result.returnedCount).toBe(1)
  })
})

describe('filter: captureVersions', () => {
  it('filters by captureVersions list', async () => {
    await repo.append(makeRecord({ captureVersion: '9.0.0' }))
    await repo.append(makeRecord({ captureVersion: '1.0.0' }))
    const result = await repo.query({ filter: { captureVersions: ['9.0.0'] } })
    expect(result.returnedCount).toBe(1)
  })
})

describe('filter: producedAt range', () => {
  it('from inclusive, to exclusive', async () => {
    const base = new Date('2026-01-01T00:00:00Z')
    await repo.append(makeRecord({ producedAt: new Date('2025-12-31T23:59:59Z') }))
    await repo.append(makeRecord({ producedAt: base }))
    await repo.append(makeRecord({ producedAt: new Date('2026-01-02T00:00:00Z') }))
    const result = await repo.query({
      filter: { producedAt: { from: base, to: new Date('2026-01-02T00:00:00Z') } },
    })
    expect(result.returnedCount).toBe(1)
  })
})

describe('filter: storedAt range', () => {
  it('from inclusive returns records stored after boundary', async () => {
    await repo.append(makeRecord())
    const after = new Date(Date.now() + 5000)
    const result = await repo.query({ filter: { storedAt: { from: after } } })
    expect(result.returnedCount).toBe(0)
  })
})

describe('combined filters (AND semantics)', () => {
  it('intent + schemaVersion both must match', async () => {
    const hash = '4'.repeat(64)
    await repo.append(makeRecord({ intentHash: hash, schemaVersion: '2.0.0' }))
    await repo.append(makeRecord({ intentHash: hash, schemaVersion: '1.0.0' }))
    await repo.append(makeRecord({ intentHash: 'a'.repeat(64), schemaVersion: '2.0.0' }))
    const result = await repo.query({ filter: { intentHash: hash, schemaVersions: ['2.0.0'] } })
    expect(result.returnedCount).toBe(1)
  })

  it('experienceIds + intentHash intersection', async () => {
    const hash = '5'.repeat(64)
    const r1 = makeRecord({ intentHash: hash })
    const r2 = makeRecord({ intentHash: hash })
    await repo.append(r1); await repo.append(r2)
    const result = await repo.query({ filter: { experienceIds: [r1.experienceId], intentHash: hash } })
    expect(result.returnedCount).toBe(1)
    expect((result.items[0] as { experienceId: string }).experienceId).toBe(r1.experienceId)
  })
})

// ─── Ordering ─────────────────────────────────────────────────────────────────

describe('ordering: producedAt ASC', () => {
  it('returns oldest first', async () => {
    const older = makeRecord({ producedAt: new Date('2026-01-01T00:00:00Z') })
    const newer = makeRecord({ producedAt: new Date('2026-06-01T00:00:00Z') })
    await repo.append(newer); await repo.append(older)
    const result = await repo.query({ order: { field: ExperienceQueryOrderField.PRODUCED_AT, direction: QueryDirection.ASC } })
    const ids = result.items.map(i => (i as { experienceId: string }).experienceId)
    expect(ids[0]).toBe(older.experienceId)
    expect(ids[1]).toBe(newer.experienceId)
  })
})

describe('ordering: producedAt DESC', () => {
  it('returns newest first', async () => {
    const older = makeRecord({ producedAt: new Date('2026-01-01T00:00:00Z') })
    const newer = makeRecord({ producedAt: new Date('2026-06-01T00:00:00Z') })
    await repo.append(newer); await repo.append(older)
    const result = await repo.query({ order: { field: ExperienceQueryOrderField.PRODUCED_AT, direction: QueryDirection.DESC } })
    const ids = result.items.map(i => (i as { experienceId: string }).experienceId)
    expect(ids[0]).toBe(newer.experienceId)
    expect(ids[1]).toBe(older.experienceId)
  })
})

// ─── Pagination correctness ────────────────────────────────────────────────────

describe('pagination: exact page boundary', () => {
  it('no cursor when results fit exactly in one page', async () => {
    await repo.append(makeRecord()); await repo.append(makeRecord())
    const result = await repo.query({ page: { limit: 2 } })
    expect(result.returnedCount).toBe(2)
    expect(result.nextCursor).toBeUndefined()
  })

  it('produces cursor only when more records exist', async () => {
    await repo.append(makeRecord()); await repo.append(makeRecord()); await repo.append(makeRecord())
    const result = await repo.query({ page: { limit: 2 } })
    expect(result.returnedCount).toBe(2)
    expect(result.nextCursor).toBeDefined()
  })

  it('last page has no cursor', async () => {
    for (let i = 0; i < 3; i++) await repo.append(makeRecord())
    const p1 = await repo.query({ page: { limit: 2 } })
    const p2 = await repo.query({ page: { limit: 2, cursor: p1.nextCursor } })
    expect(p2.returnedCount).toBe(1)
    expect(p2.nextCursor).toBeUndefined()
  })
})

describe('pagination: no skip, no duplicate across pages', () => {
  it('all records appear exactly once across all pages (ASC)', async () => {
    const records: ExperienceRecord[] = []
    for (let i = 0; i < 7; i++) {
      const r = makeRecord({ producedAt: new Date(`2026-0${i + 1}-01T00:00:00Z`) })
      records.push(r)
      await repo.append(r)
    }
    const seen = new Set<string>()
    let cursor: string | undefined
    do {
      const result = await repo.query({
        order: { field: ExperienceQueryOrderField.PRODUCED_AT, direction: QueryDirection.ASC },
        page: { limit: 3, cursor },
      })
      for (const item of result.items) {
        const id = (item as { experienceId: string }).experienceId
        expect(seen.has(id)).toBe(false)
        seen.add(id)
      }
      cursor = result.nextCursor
    } while (cursor)
    expect(seen.size).toBe(7)
    for (const r of records) expect(seen.has(r.experienceId)).toBe(true)
  })

  it('all records appear exactly once across all pages (DESC)', async () => {
    for (let i = 0; i < 5; i++) {
      await repo.append(makeRecord({ producedAt: new Date(`2026-0${i + 1}-01T00:00:00Z`) }))
    }
    const seen = new Set<string>()
    let cursor: string | undefined
    do {
      const result = await repo.query({
        order: { field: ExperienceQueryOrderField.PRODUCED_AT, direction: QueryDirection.DESC },
        page: { limit: 2, cursor },
      })
      for (const item of result.items) {
        const id = (item as { experienceId: string }).experienceId
        expect(seen.has(id)).toBe(false)
        seen.add(id)
      }
      cursor = result.nextCursor
    } while (cursor)
    expect(seen.size).toBe(5)
  })
})

describe('pagination: tied timestamps (DESC primary, ASC experience_id tie-break)', () => {
  it('5 records same producedAt, limit 2 — each id appears exactly once', async () => {
    const ts = new Date('2026-07-01T00:00:00Z')
    for (let i = 0; i < 5; i++) await repo.append(makeRecord({ producedAt: ts }))
    const seen = new Set<string>()
    let cursor: string | undefined
    do {
      const result = await repo.query({
        order: { field: ExperienceQueryOrderField.PRODUCED_AT, direction: QueryDirection.DESC },
        page: { limit: 2, cursor },
      })
      for (const item of result.items) {
        const id = (item as { experienceId: string }).experienceId
        expect(seen.has(id)).toBe(false)
        seen.add(id)
      }
      cursor = result.nextCursor
    } while (cursor)
    expect(seen.size).toBe(5)
  })
})

// ─── Snapshot isolation ────────────────────────────────────────────────────────

describe('snapshot isolation', () => {
  it('records appended after snapshot not visible on subsequent pages', async () => {
    for (let i = 0; i < 2; i++) await repo.append(makeRecord())
    const p1 = await repo.query({ page: { limit: 1 } })
    // Append new record after first page
    await repo.append(makeRecord())
    // Second page uses same snapshot — must not see the new record
    const p2 = await repo.query({ page: { limit: 1, cursor: p1.nextCursor } })
    expect(p2.returnedCount).toBe(1)
    const allIds = [
      (p1.items[0] as { experienceId: string }).experienceId,
      (p2.items[0] as { experienceId: string }).experienceId,
    ]
    expect(new Set(allIds).size).toBe(2)
  })
})

// ─── Cursor mismatch ──────────────────────────────────────────────────────────

describe('cursor mismatch', () => {
  it('cursor from different query (different filter) is rejected', async () => {
    for (let i = 0; i < 3; i++) await repo.append(makeRecord())
    const p1 = await repo.query({ page: { limit: 1 } })
    const cursor = p1.nextCursor!
    // Different filter changes queryHash — cursor must be rejected
    await expect(repo.query({
      filter: { intentHash: 'e'.repeat(64) },
      page: { limit: 1, cursor },
    })).rejects.toThrow()
  })
})

// ─── Projection ───────────────────────────────────────────────────────────────

describe('projection: METADATA vs FULL', () => {
  it('METADATA projection returns ExperienceMetadataProjection without payload fields', async () => {
    const r = makeRecord()
    await repo.append(r)
    const result = await repo.query({ projection: ExperienceProjection.METADATA })
    const item = result.items[0] as Record<string, unknown>
    expect(item['experienceId']).toBe(r.experienceId)
    expect(item['scores']).toBeUndefined()
  })

  it('FULL projection returns complete ExperienceRecord', async () => {
    const r = makeRecord()
    await repo.append(r)
    const result = await repo.query({ projection: ExperienceProjection.FULL })
    const item = result.items[0] as Record<string, unknown>
    expect(item['scores']).toBeDefined()
    expect((item['fingerprint'] as Record<string, unknown>)['experienceId']).toBe(r.experienceId)
  })

  it('FULL projection: producedAt is Date instance', async () => {
    const r = makeRecord()
    await repo.append(r)
    const result = await repo.query({ projection: ExperienceProjection.FULL })
    const item = result.items[0] as { producedAt: unknown }
    expect(item.producedAt).toBeInstanceOf(Date)
  })
})

// ─── getById ──────────────────────────────────────────────────────────────────

describe('getById', () => {
  it('returns undefined for missing id', async () => {
    expect(await repo.getById(hex64())).toBeUndefined()
  })

  it('returns record with correct id', async () => {
    const r = makeRecord()
    await repo.append(r)
    const found = await repo.getById(r.experienceId)
    expect(found?.experienceId).toBe(r.experienceId)
  })

  it('returned record has Date producedAt', async () => {
    const r = makeRecord()
    await repo.append(r)
    const found = await repo.getById(r.experienceId)
    expect(found?.producedAt).toBeInstanceOf(Date)
  })

  it('integrity error on payload with wrong experienceId (corrupt row)', async () => {
    const r = makeRecord()
    await repo.append(r)
    // Directly corrupt the payload via raw SQL
    const db = (repo as unknown as { db: import('better-sqlite3').Database }).db!
    const badPayload = JSON.stringify({ ...r, experienceId: hex64(), producedAt: r.producedAt.toISOString() })
    db.prepare('UPDATE experiences SET payload = ?, payload_hash = ? WHERE experience_id = ?').run(
      badPayload, '', r.experienceId
    )
    await expect(repo.getById(r.experienceId)).rejects.toThrow(ExperienceQueryIntegrityError)
  })
})

// ─── Corrupted canonical payload in FULL query ────────────────────────────────

describe('corrupted canonical payload', () => {
  it('hydrateRecord throws ExperienceQueryIntegrityError when payload experienceId mismatches', async () => {
    const r = makeRecord()
    await repo.append(r)
    const db = (repo as unknown as { db: import('better-sqlite3').Database }).db!
    // Corrupt payload: swap experienceId with a different hex id so _parsePayload detects mismatch
    const corrupt = JSON.stringify({ ...r, experienceId: hex64(), producedAt: r.producedAt.toISOString() })
    db.prepare('UPDATE experiences SET payload = ?, payload_hash = ? WHERE experience_id = ?').run(
      corrupt, '', r.experienceId,
    )
    await expect(repo.query({ projection: ExperienceProjection.FULL })).rejects.toThrow(ExperienceQueryIntegrityError)
  })
})

// ─── Backfill — more than 500 records ─────────────────────────────────────────

describe('backfill: processes full corpus', () => {
  it('backfills more than 500 un-indexed records on re-initialize', async () => {
    // Inject 550 rows directly into experiences table (bypassing index)
    const db = (repo as unknown as { db: import('better-sqlite3').Database }).db!
    const insert = db.prepare(
      `INSERT INTO experiences (experience_id, evaluation_record_id, schema_version, capture_version, repository_version, payload, payload_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    const count = 550
    const now = new Date().toISOString()
    db.transaction(() => {
      for (let i = 0; i < count; i++) {
        const r = makeRecord()
        const payload = JSON.stringify({ ...r, producedAt: r.producedAt.toISOString() })
        insert.run(r.experienceId, r.evaluationRecordId, '1.0.0', '1.0.0', '1.1.0', payload, '', now)
      }
    })()
    // Close and re-open — backfill must process all 550
    await repo.close()
    repo = new LocalExperienceRepository(dbPath)
    await repo.initialize()
    const result = await repo.query({ page: { limit: 200 } })
    // All 550 should be indexed (multiple pages needed but totalStored tracks all)
    const stats = repo.getStats()
    expect(stats.totalStored).toBeGreaterThanOrEqual(count)
    // Verify index was built by querying — if backfill capped at 500, 50 would be invisible
    let total = 0
    let cursor: string | undefined
    do {
      const r = await repo.query({ page: { limit: 200, cursor } })
      total += r.returnedCount
      cursor = r.nextCursor
    } while (cursor)
    expect(total).toBeGreaterThanOrEqual(count)
  }, 30000)
})

// ─── Backfill restart-safe ─────────────────────────────────────────────────────

describe('backfill: idempotent re-initialize', () => {
  it('double initialize does not duplicate index rows', async () => {
    for (let i = 0; i < 5; i++) await repo.append(makeRecord())
    await repo.close()
    repo = new LocalExperienceRepository(dbPath)
    await repo.initialize()
    const result = await repo.query({})
    expect(result.returnedCount).toBe(5)
  })
})

// ─── Query after close ────────────────────────────────────────────────────────

describe('query after close', () => {
  it('throws ExperienceQueryUnavailableError', async () => {
    await repo.close()
    await expect(repo.query({})).rejects.toThrow(ExperienceQueryUnavailableError)
  })

  it('getById after close throws ExperienceQueryUnavailableError', async () => {
    await repo.close()
    await expect(repo.getById(hex64())).rejects.toThrow(ExperienceQueryUnavailableError)
  })
})

// ─── Identity collision ───────────────────────────────────────────────────────

describe('identity collision', () => {
  it('same experienceId different payload content throws ExperienceQueryIntegrityError', async () => {
    const r = makeRecord()
    await repo.append(r)
    // Alter a field so the serialized payload differs → different hash
    const tampered = { ...r, sessionId: 'tampered' }
    await expect(repo.append(tampered as ExperienceRecord)).rejects.toThrow(ExperienceQueryIntegrityError)
  })
})
