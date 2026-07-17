import { describe, it, expect } from 'vitest'
import { CorpusMetadataEngine } from '../corpus-metadata-engine.js'
import type { ExecutionRecord } from '@rohinik-org/compiler'
import { randomUUID } from 'node:crypto'

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

describe('CorpusMetadataEngine', () => {
  it('starts empty', () => {
    const engine = new CorpusMetadataEngine()
    const info = engine.getInfo()
    expect(info.totalRecords).toBe(0)
    expect(info.isIndexed).toBe(true)
  })

  it('increments record count on observe', () => {
    const engine = new CorpusMetadataEngine()
    engine.observe(record())
    engine.observe(record())
    expect(engine.getInfo().totalRecords).toBe(2)
  })

  it('tracks first and last record timestamps', () => {
    const engine = new CorpusMetadataEngine()
    engine.observe(record({ timestamp: '2026-07-06T00:00:00Z' }))
    engine.observe(record({ timestamp: '2026-07-08T00:00:00Z' }))
    const info = engine.getInfo()
    expect(info.firstRecordAt).toBe('2026-07-06T00:00:00Z')
    expect(info.lastRecordAt).toBe('2026-07-08T00:00:00Z')
  })

  it('tracks skill counts in daily index', () => {
    const engine = new CorpusMetadataEngine()
    engine.observe(record({ winnerSkillId: 'csv.parse', timestamp: '2026-07-08T10:00:00Z' }))
    engine.observe(record({ winnerSkillId: 'csv.parse', timestamp: '2026-07-08T11:00:00Z' }))
    engine.observe(record({ winnerSkillId: 'weather.fetch', timestamp: '2026-07-08T12:00:00Z' }))
    const index = engine.getDailyIndex('2026-07-08')
    expect(index.skillCounts['csv.parse']).toBe(2)
    expect(index.skillCounts['weather.fetch']).toBe(1)
  })

  it('tracks outcome counts', () => {
    const engine = new CorpusMetadataEngine()
    engine.observe(record({ outcome: 'SUCCESS' }))
    engine.observe(record({ outcome: 'SUCCESS' }))
    engine.observe(record({ outcome: 'FAILED' }))
    const info = engine.getInfo()
    expect(info.totalRecords).toBe(3)
    expect(info.successRate).toBeCloseTo(2 / 3)
  })

  it('tracks running latency average', () => {
    const engine = new CorpusMetadataEngine()
    engine.observe(record({ totalLatencyMs: 100 }))
    engine.observe(record({ totalLatencyMs: 200 }))
    const info = engine.getInfo()
    expect(info.avgLatencyMs).toBe(150)
  })
})
