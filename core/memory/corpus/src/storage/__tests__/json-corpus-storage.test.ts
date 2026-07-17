import { describe, it, expect, afterEach } from 'vitest'
import { rm, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { JsonCorpusStorage } from '../json-corpus-storage.js'
import type { ExecutionRecord } from '@rohinik-org/compiler'

function makeRecord(overrides: Partial<ExecutionRecord> = {}): ExecutionRecord {
  return {
    kind: 'ExecutionRecord', schemaVersion: '1.0',
    recordId: randomUUID(), runtimeId: 'r1',
    timestamp: new Date().toISOString(),
    requestId: randomUUID(), requestHash: 'sha256-h', contentType: 'TEXT',
    requestSizeBytes: 10, outcome: 'SUCCESS',
    allCandidates: [], reasoningInvoked: false, retried: false, retryCount: 0,
    totalLatencyMs: 5, tierLatencies: [], providerResolutions: [],
    sourceTraceId: 'trace-1', runtimeVersion: '0.1.0',
    ...overrides,
  }
}

describe('JsonCorpusStorage', () => {
  const roots: string[] = []

  async function tmpRoot(): Promise<string> {
    const dir = join(tmpdir(), `corpus-test-${randomUUID()}`)
    await mkdir(dir, { recursive: true })
    roots.push(dir)
    return dir
  }

  afterEach(async () => {
    for (const r of roots) await rm(r, { recursive: true, force: true })
    roots.length = 0
  })

  it('writes a record and reads it back', async () => {
    const storage = new JsonCorpusStorage(await tmpRoot())
    const record = makeRecord()
    await storage.write(record)
    const read = await storage.read(record.recordId)
    expect(read).not.toBeNull()
    expect(read?.recordId).toBe(record.recordId)
    expect(read?.outcome).toBe('SUCCESS')
  })

  it('returns null for unknown recordId', async () => {
    const storage = new JsonCorpusStorage(await tmpRoot())
    const result = await storage.read('does-not-exist')
    expect(result).toBeNull()
  })

  it('writes to date-partitioned directory', async () => {
    const root = await tmpRoot()
    const storage = new JsonCorpusStorage(root)
    const record = makeRecord({ timestamp: '2026-07-08T12:00:00Z' })
    await storage.write(record)
    const { existsSync } = await import('node:fs')
    expect(existsSync(join(root, '2026-07-08'))).toBe(true)
  })

  it('readRange returns records in date window', async () => {
    const storage = new JsonCorpusStorage(await tmpRoot())
    const r1 = makeRecord({ timestamp: '2026-07-07T10:00:00Z' })
    const r2 = makeRecord({ timestamp: '2026-07-08T10:00:00Z' })
    const r3 = makeRecord({ timestamp: '2026-07-09T10:00:00Z' })
    await storage.write(r1)
    await storage.write(r2)
    await storage.write(r3)

    const results: ExecutionRecord[] = []
    for await (const r of storage.readRange('2026-07-07', '2026-07-08')) {
      results.push(r)
    }
    const ids = results.map(r => r.recordId)
    expect(ids).toContain(r1.recordId)
    expect(ids).toContain(r2.recordId)
    expect(ids).not.toContain(r3.recordId)
  })

  it('close resolves without error', async () => {
    const storage = new JsonCorpusStorage(await tmpRoot())
    await expect(storage.close()).resolves.toBeUndefined()
  })
})
