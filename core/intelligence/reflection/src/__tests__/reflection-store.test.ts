import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { tmpdir } from 'node:os'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { ReflectionReport } from '@rohinik-org/compiler'
import { NullReflectionStore } from '../store/null-reflection-store.js'
import { JsonReflectionStore } from '../store/json-reflection-store.js'

function makeReport(overrides: Partial<ReflectionReport> = {}): ReflectionReport {
  return {
    kind: 'ReflectionReport', schemaVersion: '1.0',
    reportId: 'r1', executionId: 'e1',
    createdAt: '2026-01-01T00:00:00.000Z',
    rootCause: { causeId: 'c1', category: 'UNKNOWN', confidence: 0.5, evidence: [] },
    findings: [{ findingId: 'f1', category: 'FAILURE', confidence: 0.9, evidence: ['e1'], summary: 'step failed' }],
    recommendations: [{ recommendationId: 'rec1', kind: 'RETRY', confidence: 0.8, explanation: 'retry', findingRefs: ['f1'] }],
    status: 'APPROVED',
    ...overrides,
  }
}

function runStoreTests(name: string, factory: () => Promise<{ store: NullReflectionStore | JsonReflectionStore; cleanup?: () => Promise<void> }>) {
  describe(name, () => {
    let store: NullReflectionStore | JsonReflectionStore
    let cleanup: (() => Promise<void>) | undefined

    beforeEach(async () => {
      const result = await factory()
      store = result.store
      cleanup = result.cleanup
    })

    afterEach(async () => { if (cleanup) await cleanup() })

    it('save + get round-trips', async () => {
      const r = makeReport()
      await store.save(r)
      expect(await store.get('r1')).toEqual(r)
    })

    it('get unknown returns undefined', async () => {
      expect(await store.get('nope')).toBeUndefined()
    })

    it('list returns all saved', async () => {
      await store.save(makeReport({ reportId: 'r1', createdAt: '2026-01-01T00:00:00.000Z' }))
      await store.save(makeReport({ reportId: 'r2', createdAt: '2026-01-02T00:00:00.000Z' }))
      expect((await store.list()).length).toBe(2)
    })

    it('latest returns most recent by createdAt', async () => {
      await store.save(makeReport({ reportId: 'r1', createdAt: '2026-01-01T00:00:00.000Z' }))
      await store.save(makeReport({ reportId: 'r2', createdAt: '2026-01-03T00:00:00.000Z' }))
      await store.save(makeReport({ reportId: 'r3', createdAt: '2026-01-02T00:00:00.000Z' }))
      expect((await store.latest())?.reportId).toBe('r2')
    })

    it('search by executionId', async () => {
      await store.save(makeReport({ reportId: 'r1', executionId: 'exec-a' }))
      await store.save(makeReport({ reportId: 'r2', executionId: 'exec-b' }))
      const results = await store.search({ executionId: 'exec-a' })
      expect(results.length).toBe(1)
      expect(results[0]?.reportId).toBe('r1')
    })

    it('search with limit', async () => {
      await store.save(makeReport({ reportId: 'r1', createdAt: '2026-01-01T00:00:00.000Z' }))
      await store.save(makeReport({ reportId: 'r2', createdAt: '2026-01-02T00:00:00.000Z' }))
      await store.save(makeReport({ reportId: 'r3', createdAt: '2026-01-03T00:00:00.000Z' }))
      const results = await store.search({ limit: 2 })
      expect(results.length).toBe(2)
    })

    it('removeById deletes and returns true', async () => {
      await store.save(makeReport())
      expect(await store.removeById('r1')).toBe(true)
      expect(await store.get('r1')).toBeUndefined()
    })

    it('removeById unknown returns false', async () => {
      expect(await store.removeById('nope')).toBe(false)
    })
  })
}

runStoreTests('NullReflectionStore', async () => ({ store: new NullReflectionStore() }))

runStoreTests('JsonReflectionStore', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'reflection-test-'))
  return {
    store: new JsonReflectionStore(dir),
    cleanup: () => rm(dir, { recursive: true, force: true }),
  }
})
