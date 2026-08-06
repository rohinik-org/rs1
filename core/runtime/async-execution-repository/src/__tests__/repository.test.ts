import { describe, it, expect, beforeEach } from 'vitest'
import {
  InMemoryAsyncExecutionRepository,
  createAsyncExecutionRecord,
  type AsyncExecutionRecord,
} from '../index.js'
import type { SubmitExecutionRequest } from '@rohinik-org/execution-protocol-v1'

const req: SubmitExecutionRequest = {
  content:     'test intent',
  contentType: 'text/plain',
}

const reqWithKey: SubmitExecutionRequest = {
  ...req,
  idempotencyKey: 'idem-key-1',
}

describe('createAsyncExecutionRecord', () => {
  it('initial state is QUEUED', () => {
    const r = createAsyncExecutionRecord(req)
    expect(r.state).toBe('QUEUED')
  })

  it('executionId equals internalExecutionId', () => {
    const r = createAsyncExecutionRecord(req)
    expect(r.executionId).toBe(r.internalExecutionId)
  })

  it('idempotencyKey null when not provided', () => {
    const r = createAsyncExecutionRecord(req)
    expect(r.idempotencyKey).toBeNull()
  })

  it('idempotencyKey set from request', () => {
    const r = createAsyncExecutionRecord(reqWithKey)
    expect(r.idempotencyKey).toBe('idem-key-1')
  })

  it('overrideExecutionId respected', () => {
    const r = createAsyncExecutionRecord(req, 'fixed-id')
    expect(r.executionId).toBe('fixed-id')
    expect(r.internalExecutionId).toBe('fixed-id')
  })

  it('result null, evidenceEntries empty', () => {
    const r = createAsyncExecutionRecord(req)
    expect(r.result).toBeNull()
    expect(r.evidenceEntries).toHaveLength(0)
  })

  it('protocolVersion is v1', () => {
    const r = createAsyncExecutionRecord(req)
    expect(r.protocolVersion).toBe('v1')
  })
})

describe('InMemoryAsyncExecutionRepository', () => {
  let repo: InMemoryAsyncExecutionRepository
  let record: AsyncExecutionRecord

  beforeEach(() => {
    repo = new InMemoryAsyncExecutionRepository()
    record = createAsyncExecutionRecord(req, 'exec-1')
  })

  it('save and findById', async () => {
    await repo.save(record)
    const found = await repo.findById('exec-1')
    expect(found).toEqual(record)
  })

  it('findById returns undefined for unknown id', async () => {
    expect(await repo.findById('nope')).toBeUndefined()
  })

  it('save throws on duplicate executionId', async () => {
    await repo.save(record)
    await expect(repo.save(record)).rejects.toThrow('already exists')
  })

  it('findByIdempotencyKey resolves correctly', async () => {
    const r = createAsyncExecutionRecord(reqWithKey, 'exec-idem')
    await repo.save(r)
    const found = await repo.findByIdempotencyKey('idem-key-1')
    expect(found?.executionId).toBe('exec-idem')
  })

  it('findByIdempotencyKey undefined when no key', async () => {
    await repo.save(record)
    expect(await repo.findByIdempotencyKey('idem-key-1')).toBeUndefined()
  })

  it('update state transition', async () => {
    await repo.save(record)
    const updated = await repo.update('exec-1', { state: 'RUNNING', startedAt: new Date().toISOString() })
    expect(updated.state).toBe('RUNNING')
    expect(updated.startedAt).not.toBeNull()
  })

  it('update registers sessionId index', async () => {
    await repo.save(record)
    await repo.update('exec-1', { internalSessionId: 'sess-abc' })
    const found = await repo.findBySessionId('sess-abc')
    expect(found?.executionId).toBe('exec-1')
  })

  it('update throws on missing executionId', async () => {
    await expect(repo.update('ghost', { state: 'RUNNING' })).rejects.toThrow()
  })

  it('terminal record rejects state change', async () => {
    await repo.save(record)
    await repo.update('exec-1', {
      state: 'COMPLETED',
      completedAt: new Date().toISOString(),
      result: { output: 'done', totalDurationMs: 100, completedAt: new Date().toISOString() },
    })
    await expect(repo.update('exec-1', { state: 'RUNNING' })).rejects.toThrow()
  })

  it('terminal record rejects result overwrite', async () => {
    await repo.save(record)
    const now = new Date().toISOString()
    await repo.update('exec-1', {
      state: 'COMPLETED',
      completedAt: now,
      result: { output: 'v1', totalDurationMs: 50, completedAt: now },
    })
    await expect(
      repo.update('exec-1', { result: { output: 'v2', totalDurationMs: 99, completedAt: now } })
    ).rejects.toThrow()
  })

  it('terminal record allows non-state/result patch (timestamps already set — update rejected for state, not for new inapplicable fields)', async () => {
    // Non-state, non-result patches on terminal records are allowed (e.g. no-op patches)
    await repo.save(record)
    const now = new Date().toISOString()
    await repo.update('exec-1', {
      state: 'CANCELLED',
      cancelledAt: now,
    })
    // patch with same state is fine (no change)
    const r = await repo.update('exec-1', { state: 'CANCELLED' })
    expect(r.state).toBe('CANCELLED')
  })

  it('appendEvidence accumulates entries', async () => {
    await repo.save(record)
    await repo.appendEvidence('exec-1', [
      { kind: 'step-started', stepId: 's1', detail: null, recordedAt: new Date().toISOString() },
    ])
    await repo.appendEvidence('exec-1', [
      { kind: 'step-completed', stepId: 's1', detail: { ok: true }, recordedAt: new Date().toISOString() },
    ])
    const r = await repo.findById('exec-1')
    expect(r?.evidenceEntries).toHaveLength(2)
    expect(r?.evidenceEntries[0]?.kind).toBe('step-started')
  })

  it('appendEvidence on unknown id is no-op', async () => {
    await expect(repo.appendEvidence('ghost', [])).resolves.toBeUndefined()
  })

  it('appendEvidence on terminal record still accumulates (post-completion evidence)', async () => {
    await repo.save(record)
    const now = new Date().toISOString()
    await repo.update('exec-1', {
      state: 'COMPLETED',
      completedAt: now,
      result: { output: 'x', totalDurationMs: 10, completedAt: now },
    })
    await repo.appendEvidence('exec-1', [
      { kind: 'evaluation', stepId: null, detail: { score: 0.9 }, recordedAt: now },
    ])
    const r = await repo.findById('exec-1')
    expect(r?.evidenceEntries).toHaveLength(1)
  })
})
