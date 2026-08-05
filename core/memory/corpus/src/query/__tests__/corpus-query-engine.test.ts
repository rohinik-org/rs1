import { describe, it, expect, afterEach } from 'vitest'
import { rm, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { JsonCorpusStorage } from '../../storage/json-corpus-storage.js'
import { CorpusMetadataEngine } from '../../metadata/corpus-metadata-engine.js'
import { CorpusQueryEngine } from '../corpus-query-engine.js'
import type { ExecutionRecord } from '@rohinik-org/compiler'

const roots: string[] = []

async function tmpRoot(): Promise<string> {
  const dir = join(tmpdir(), `query-test-${randomUUID()}`)
  await mkdir(dir, { recursive: true })
  roots.push(dir)
  return dir
}

function record(overrides: Partial<ExecutionRecord> = {}): ExecutionRecord {
  return {
    kind: 'ExecutionRecord', schemaVersion: '1.0', recordId: randomUUID(),
    runtimeId: 'r', timestamp: '2026-07-08T12:00:00Z',
    requestId: randomUUID(), requestHash: 'h', contentType: 'TEXT',
    requestSizeBytes: 10, outcome: 'SUCCESS', allCandidates: [],
    reasoningInvoked: false, retried: false, retryCount: 0,
    totalLatencyMs: 100, tierLatencies: [], providerResolutions: [],
    sourceTraceId: 't', runtimeVersion: '0.1.0', ...overrides,
  }
}

afterEach(async () => {
  for (const r of roots) await rm(r, { recursive: true, force: true })
  roots.length = 0
})

describe('CorpusQueryEngine', () => {
  it('count returns 0 for empty corpus', async () => {
    const root = await tmpRoot()
    const storage = new JsonCorpusStorage(root)
    const meta = new CorpusMetadataEngine()
    const engine = new CorpusQueryEngine(storage, meta)
    expect(await engine.count({})).toBe(0)
  })

  it('count reflects written records', async () => {
    const root = await tmpRoot()
    const storage = new JsonCorpusStorage(root)
    const meta = new CorpusMetadataEngine()
    const engine = new CorpusQueryEngine(storage, meta)
    const r1 = record()
    const r2 = record()
    await storage.write(r1); meta.observe(r1)
    await storage.write(r2); meta.observe(r2)
    expect(await engine.count({})).toBe(2)
  })

  it('query filters by outcome', async () => {
    const root = await tmpRoot()
    const storage = new JsonCorpusStorage(root)
    const meta = new CorpusMetadataEngine()
    const engine = new CorpusQueryEngine(storage, meta)
    const success = record({ outcome: 'SUCCESS' })
    const failed = record({ outcome: 'FAILED' })
    await storage.write(success); meta.observe(success)
    await storage.write(failed); meta.observe(failed)

    const results = await engine.query({ outcome: 'FAILED' })
    expect(results).toHaveLength(1)
    expect(results[0]!.outcome).toBe('FAILED')
  })

  it('query filters by skillId', async () => {
    const root = await tmpRoot()
    const storage = new JsonCorpusStorage(root)
    const meta = new CorpusMetadataEngine()
    const engine = new CorpusQueryEngine(storage, meta)
    const csv = record({ winnerSkillId: 'csv.parse' })
    const weather = record({ winnerSkillId: 'weather.fetch' })
    await storage.write(csv); meta.observe(csv)
    await storage.write(weather); meta.observe(weather)

    const results = await engine.query({ skillId: 'csv.parse' })
    expect(results).toHaveLength(1)
    expect(results[0]!.winnerSkillId).toBe('csv.parse')
  })

  it('stats returns successRate and latency percentiles', async () => {
    const root = await tmpRoot()
    const storage = new JsonCorpusStorage(root)
    const meta = new CorpusMetadataEngine()
    const engine = new CorpusQueryEngine(storage, meta)
    const r1 = record({ outcome: 'SUCCESS', totalLatencyMs: 100 })
    const r2 = record({ outcome: 'SUCCESS', totalLatencyMs: 200 })
    const r3 = record({ outcome: 'FAILED', totalLatencyMs: 50 })
    for (const r of [r1, r2, r3]) { await storage.write(r); meta.observe(r) }

    const stats = await engine.stats({})
    expect(stats.total).toBe(3)
    expect(stats.successRate).toBeCloseTo(2 / 3)
    expect(stats.latencyPercentiles[50]).toBeGreaterThan(0)
  })
})
