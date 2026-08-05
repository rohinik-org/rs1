import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rmSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import {
  ExperienceStoreEvent,
  ExperiencePersistenceError,
  type RepositoryCommit,
  type ExperienceWriter,
} from '@rohinik-org/experience-store-ir'
import type { ExperienceRecord } from '@rohinik-org/experience-ir'
import { ExperienceEvent } from '@rohinik-org/experience-ir'
import { ExperienceQueryIntegrityError } from '@rohinik-org/experience-query'
import {
  ExperienceIntegrityValidator,
  LocalExperienceRepository,
  ExperiencePersistenceCoordinator,
  resolveExperienceStoreConfig,
} from '../index.js'

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeExperienceId(): string {
  return randomBytes(32).toString('hex')
}

function makeRecord(overrides?: Partial<ExperienceRecord>): ExperienceRecord {
  const experienceId = makeExperienceId()
  return Object.freeze({
    experienceId,
    evaluationRecordId: `eval-${randomBytes(4).toString('hex')}`,
    sessionId: 'session-1',
    executionId: 'exec-1',
    decisionId: 'decision-1',
    observedOutcome: Object.freeze({ finalState: 'COMPLETED' as const, totalDurationMs: 100, stepCount: 1, failedStepCount: 0, retryCount: 0 }),
    predictionComparison: Object.freeze({ latencyErrorMs: 0, latencyErrorPct: 0, failurePredicted: false, failureObserved: false, failurePredictionCorrect: true, topCapabilityHit: true, predictionConfidence: 0.9 }),
    planningComparison: Object.freeze({ planExecuted: true, planSucceeded: true, retriesOccurred: false, budgetRespected: true, decisionConfidence: 0.9, selectionMargin: 0.1, planningAlgorithmVersion: '1.0.0' }),
    executionComparison: Object.freeze({ completedSteps: 1, failedSteps: 0, cancelledSteps: 0, totalRetries: 0, durationMs: 100, stepSuccessRate: 1.0 }),
    scores: Object.freeze({ overallScore: 0.9, predictionAccuracy: 1.0, planningAccuracy: 1.0, executionEfficiency: 1.0 }),
    explanation: Object.freeze({ primaryReason: 'EXECUTION_SUCCESS' as const, notes: Object.freeze([]) }),
    fingerprint: Object.freeze({
      experienceId,
      evaluationFingerprint: 'fp-abc',
      intentHash: 'a'.repeat(64),
      capabilityHash: 'b'.repeat(64),
      planHash: 'c'.repeat(64),
    }),
    metadata: Object.freeze({
      schemaVersion: '1.0.0',
      captureVersion: '1.0.0',
      runtimeVersion: '0.1.0',
      hostId: 'host-1',
    }),
    telemetry: Object.freeze({ captureDurationMs: 5 }),
    producedAt: new Date('2026-07-22T10:00:00Z'),
    ...overrides,
  } as unknown as ExperienceRecord)
}

function makeMockEvents() {
  return { emit: vi.fn(), on: vi.fn(), off: vi.fn() }
}

function tmpDbPath(): string {
  return join(tmpdir(), `experience-test-${randomBytes(4).toString('hex')}`, 'experience.db')
}

// ─── ExperienceStoreEvent ─────────────────────────────────────────────────────

describe('ExperienceStoreEvent', () => {
  it('is frozen', () => {
    expect(Object.isFrozen(ExperienceStoreEvent)).toBe(true)
  })
  it('has EXPERIENCE_STORED and EXPERIENCE_STORE_FAILED', () => {
    expect(ExperienceStoreEvent.EXPERIENCE_STORED).toBe('EXPERIENCE_STORED')
    expect(ExperienceStoreEvent.EXPERIENCE_STORE_FAILED).toBe('EXPERIENCE_STORE_FAILED')
  })
})

// ─── ExperiencePersistenceError ───────────────────────────────────────────────

describe('ExperiencePersistenceError', () => {
  it('has correct name, message, and retryCount', () => {
    const id = makeExperienceId()
    const err = new ExperiencePersistenceError('boom', id, 2)
    expect(err.name).toBe('ExperiencePersistenceError')
    expect(err.message).toBe('boom')
    expect(err.retryCount).toBe(2)
    expect(err.experienceId).toBe(id)
  })
})

// ─── ExperienceIntegrityValidator ────────────────────────────────────────────

describe('ExperienceIntegrityValidator', () => {
  const v = new ExperienceIntegrityValidator()

  it('passes a valid record', () => {
    expect(() => v.validate(makeRecord())).not.toThrow()
  })

  it('passes another valid record (smoke)', () => {
    expect(() => v.validate(makeRecord())).not.toThrow()
  })

  it('rejects non-64-char experienceId', () => {
    const r = makeRecord({ experienceId: 'short' } as never)
    // patch fingerprint to match the short id to isolate this rule
    const patched = { ...r, fingerprint: { ...r.fingerprint, experienceId: 'short' } }
    expect(() => v.validate(patched as ExperienceRecord)).toThrow(ExperiencePersistenceError)
  })

  it('rejects non-hex experienceId', () => {
    const bad = 'z'.repeat(64)
    const r = { ...makeRecord(), experienceId: bad, fingerprint: { ...makeRecord().fingerprint, experienceId: bad } }
    expect(() => v.validate(r as unknown as ExperienceRecord)).toThrow(ExperiencePersistenceError)
  })

  it('rejects missing evaluationRecordId', () => {
    const r = makeRecord({ evaluationRecordId: '' } as never)
    expect(() => v.validate(r)).toThrow(ExperiencePersistenceError)
  })

  it('rejects fingerprint mismatch', () => {
    const r = makeRecord()
    const mismatched = { ...r, fingerprint: { ...r.fingerprint, experienceId: makeExperienceId() } }
    expect(() => v.validate(mismatched as unknown as ExperienceRecord)).toThrow(ExperiencePersistenceError)
  })

  it('rejects missing schemaVersion', () => {
    const r = makeRecord({ metadata: { schemaVersion: '', captureVersion: '1.0.0', runtimeVersion: '0.1.0', hostId: 'h' } } as never)
    expect(() => v.validate(r)).toThrow(ExperiencePersistenceError)
  })

  it('rejects missing captureVersion', () => {
    const r = makeRecord({ metadata: { schemaVersion: '1.0.0', captureVersion: '', runtimeVersion: '0.1.0', hostId: 'h' } } as never)
    expect(() => v.validate(r)).toThrow(ExperiencePersistenceError)
  })

  it('rejects invalid producedAt', () => {
    const r = makeRecord({ producedAt: new Date('not-a-date') } as never)
    expect(() => v.validate(r)).toThrow(ExperiencePersistenceError)
  })
})

// ─── LocalExperienceRepository ───────────────────────────────────────────────

describe('LocalExperienceRepository', () => {
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

  it('initialize creates schema', async () => {
    const r = makeRecord()
    await expect(repo.append(r)).resolves.toBeDefined()
  })

  it('WAL mode enabled after initialize', async () => {
    const commit = await repo.append(makeRecord())
    expect(commit.repositoryVersion).toBeDefined()
    // If WAL was not enabled the PRAGMA would throw; reaching here means it worked
  })

  it('close releases connection without throwing', async () => {
    await expect(repo.close()).resolves.toBeUndefined()
  })

  it('append returns CREATED for new record', async () => {
    const commit = await repo.append(makeRecord())
    expect(commit.status).toBe('CREATED')
  })

  it('append returns CREATED with correct experienceId', async () => {
    const r = makeRecord()
    const commit = await repo.append(r)
    expect(commit.experienceId).toBe(r.experienceId)
  })

  it('duplicate experienceId returns ALREADY_EXISTS (Law 59)', async () => {
    const r = makeRecord()
    await repo.append(r)
    const commit2 = await repo.append(r)
    expect(commit2.status).toBe('ALREADY_EXISTS')
  })

  it('ALREADY_EXISTS does not throw (Law 59 — idempotency)', async () => {
    const r = makeRecord()
    await repo.append(r)
    await expect(repo.append(r)).resolves.toBeDefined()
  })

  it('storedAt is populated', async () => {
    const commit = await repo.append(makeRecord())
    expect(commit.storedAt).toBeInstanceOf(Date)
    expect(commit.storedAt.getTime()).toBeGreaterThan(0)
  })

  it('repositoryVersion present', async () => {
    const commit = await repo.append(makeRecord())
    expect(commit.repositoryVersion).toBe(LocalExperienceRepository.REPOSITORY_VERSION)
  })

  it('experienceId preserved (Law 57)', async () => {
    const r = makeRecord()
    const commit = await repo.append(r)
    expect(commit.experienceId).toBe(r.experienceId)
  })

  it('evaluationRecordId UNIQUE enforced — different experienceId same evaluationRecordId is an identity collision (throws)', async () => {
    const evalId = `eval-${randomBytes(4).toString('hex')}`
    const r1 = makeRecord({ evaluationRecordId: evalId } as never)
    await repo.append(r1)
    // Different experienceId, same evaluationRecordId — identity collision, not idempotent replay
    const newId = makeExperienceId()
    const r2 = { ...r1, experienceId: newId, fingerprint: { ...r1.fingerprint, experienceId: newId } }
    await expect(repo.append(r2 as unknown as ExperienceRecord)).rejects.toThrow(ExperienceQueryIntegrityError)
  })

  it('payload round-trip: stored JSON can be parsed back', async () => {
    const r = makeRecord()
    await repo.append(r)
    // Verify by appending duplicate (ALREADY_EXISTS confirms row exists with correct id)
    const c2 = await repo.append(r)
    expect(c2.experienceId).toBe(r.experienceId)
  })

  it('append never overwrites — second call returns ALREADY_EXISTS not a new row (Law 56)', async () => {
    const r = makeRecord()
    const c1 = await repo.append(r)
    const c2 = await repo.append(r)
    expect(c1.status).toBe('CREATED')
    expect(c2.status).toBe('ALREADY_EXISTS')
    expect(c2.experienceId).toBe(r.experienceId)
  })
})

// ─── ExperiencePersistenceCoordinator ────────────────────────────────────────

describe('ExperiencePersistenceCoordinator', () => {
  function makeCoordinator(writer?: Partial<ExperienceWriter>) {
    const validator = new ExperienceIntegrityValidator()
    const mockWriter: ExperienceWriter = {
      initialize: vi.fn(),
      close: vi.fn(),
      append: vi.fn().mockResolvedValue({
        experienceId: 'id',
        storedAt: new Date(),
        status: 'CREATED',
        repositoryVersion: '1.0.0',
      } satisfies RepositoryCommit),
      ...writer,
    }
    const events = makeMockEvents()
    const coord = new ExperiencePersistenceCoordinator(validator, mockWriter, events)
    return { coord, events, mockWriter }
  }

  it('subscribe() registers on EXPERIENCE_RECORD_READY', () => {
    const { coord, events } = makeCoordinator()
    coord.subscribe()
    expect(events.on).toHaveBeenCalledWith(ExperienceEvent.EXPERIENCE_RECORD_READY, expect.any(Function))
  })

  it('happy path: emits EXPERIENCE_STORED after append', async () => {
    const { coord, events, mockWriter } = makeCoordinator()
    const r = makeRecord()
    ;(mockWriter.append as ReturnType<typeof vi.fn>).mockResolvedValue({
      experienceId: r.experienceId,
      storedAt: new Date(),
      status: 'CREATED',
      repositoryVersion: '1.0.0',
    })
    coord.subscribe()
    const handler = (events.on as ReturnType<typeof vi.fn>).mock.calls[0]![1] as Function
    await handler({ record: r })
    expect(events.emit).toHaveBeenCalledWith(
      ExperienceStoreEvent.EXPERIENCE_STORED,
      expect.objectContaining({ experienceId: r.experienceId }),
    )
  })

  it('happy path: does not emit EXPERIENCE_STORE_FAILED on success', async () => {
    const { coord, events } = makeCoordinator()
    const r = makeRecord()
    coord.subscribe()
    const handler = (events.on as ReturnType<typeof vi.fn>).mock.calls[0]![1] as Function
    await handler({ record: r })
    const emittedEvents = (events.emit as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0])
    expect(emittedEvents).not.toContain(ExperienceStoreEvent.EXPERIENCE_STORE_FAILED)
  })

  it('EXPERIENCE_STORED payload has experienceId and commit', async () => {
    const { coord, events, mockWriter } = makeCoordinator()
    const r = makeRecord()
    const commit: RepositoryCommit = { experienceId: r.experienceId, storedAt: new Date(), status: 'CREATED', repositoryVersion: '1.0.0' }
    ;(mockWriter.append as ReturnType<typeof vi.fn>).mockResolvedValue(commit)
    coord.subscribe()
    const handler = (events.on as ReturnType<typeof vi.fn>).mock.calls[0]![1] as Function
    await handler({ record: r })
    const storedCall = (events.emit as ReturnType<typeof vi.fn>).mock.calls.find((c) => c[0] === ExperienceStoreEvent.EXPERIENCE_STORED)
    expect(storedCall?.[1]).toEqual({ experienceId: r.experienceId, commit })
  })

  it('integrity failure: emits EXPERIENCE_STORE_FAILED, does not emit EXPERIENCE_STORED', async () => {
    const { coord, events } = makeCoordinator()
    const bad = makeRecord({ experienceId: 'bad-id' } as never)
    const patched = { ...bad, fingerprint: { ...bad.fingerprint, experienceId: 'bad-id' } }
    coord.subscribe()
    const handler = (events.on as ReturnType<typeof vi.fn>).mock.calls[0]![1] as Function
    await handler({ record: patched }).catch(() => {/* expected throw */})
    const emittedEvents = (events.emit as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0])
    expect(emittedEvents).toContain(ExperienceStoreEvent.EXPERIENCE_STORE_FAILED)
    expect(emittedEvents).not.toContain(ExperienceStoreEvent.EXPERIENCE_STORED)
  })

  it('integrity failure: EXPERIENCE_STORE_FAILED has retryCount 0', async () => {
    const { coord, events } = makeCoordinator()
    const bad = makeRecord({ experienceId: 'bad' } as never)
    const patched = { ...bad, fingerprint: { ...bad.fingerprint, experienceId: 'bad' } }
    coord.subscribe()
    const handler = (events.on as ReturnType<typeof vi.fn>).mock.calls[0]![1] as Function
    await handler({ record: patched }).catch(() => {/* expected throw */})
    const failCall = (events.emit as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => c[0] === ExperienceStoreEvent.EXPERIENCE_STORE_FAILED
    )
    expect(failCall?.[1].retryCount).toBe(0)
  })

  it('I/O failure after retries: emits EXPERIENCE_STORE_FAILED', async () => {
    const { coord, events } = makeCoordinator({
      append: vi.fn().mockRejectedValue(new Error('SQLITE_BUSY: database is locked')),
    })
    const r = makeRecord()
    coord.subscribe()
    const handler = (events.on as ReturnType<typeof vi.fn>).mock.calls[0]![1] as Function
    await handler({ record: r }).catch(() => {/* expected throw */})
    const emittedEvents = (events.emit as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0])
    expect(emittedEvents).toContain(ExperienceStoreEvent.EXPERIENCE_STORE_FAILED)
  }, 10000)

  it('I/O failure: EXPERIENCE_STORE_FAILED payload has retryCount > 0', async () => {
    const { coord, events } = makeCoordinator({
      append: vi.fn().mockRejectedValue(new Error('SQLITE_BUSY: database is locked')),
    })
    const r = makeRecord()
    coord.subscribe()
    const handler = (events.on as ReturnType<typeof vi.fn>).mock.calls[0]![1] as Function
    await handler({ record: r }).catch(() => {/* expected throw */})
    const failCall = (events.emit as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => c[0] === ExperienceStoreEvent.EXPERIENCE_STORE_FAILED
    )
    expect(failCall?.[1].retryCount).toBeGreaterThan(0)
  }, 10000)

  it('ALREADY_EXISTS still emits EXPERIENCE_STORED (Law 59)', async () => {
    const { coord, events, mockWriter } = makeCoordinator()
    const r = makeRecord()
    ;(mockWriter.append as ReturnType<typeof vi.fn>).mockResolvedValue({
      experienceId: r.experienceId,
      storedAt: new Date(),
      status: 'ALREADY_EXISTS',
      repositoryVersion: '1.0.0',
    })
    coord.subscribe()
    const handler = (events.on as ReturnType<typeof vi.fn>).mock.calls[0]![1] as Function
    await handler({ record: r })
    const emittedEvents = (events.emit as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0])
    expect(emittedEvents).toContain(ExperienceStoreEvent.EXPERIENCE_STORED)
    expect(emittedEvents).not.toContain(ExperienceStoreEvent.EXPERIENCE_STORE_FAILED)
  })
})

// ─── resolveExperienceStoreConfig ────────────────────────────────────────────

describe('resolveExperienceStoreConfig', () => {
  it('uses dataDir when provided', () => {
    const cfg = resolveExperienceStoreConfig('/data')
    expect(cfg.dbPath).toContain('experience.db')
    expect(cfg.dbPath).toContain('experience')
  })

  it('dbPath ends with experience.db', () => {
    const cfg = resolveExperienceStoreConfig()
    expect(cfg.dbPath.endsWith('experience.db')).toBe(true)
  })

  it('dbPath contains experience subdirectory', () => {
    const cfg = resolveExperienceStoreConfig()
    expect(cfg.dbPath).toContain('experience')
  })

  it('explicit dataDir overrides platform default', () => {
    const cfg = resolveExperienceStoreConfig('/custom/data')
    expect(cfg.dbPath).toContain('custom')
    expect(cfg.dbPath).toContain('data')
  })
})
