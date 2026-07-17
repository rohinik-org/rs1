import { describe, it, expect, vi } from 'vitest'
import { CorpusWriter } from '../corpus-writer.js'
import type { CorpusStorage } from '../../storage/corpus-storage.js'
import type { CorpusMetadataEngine } from '../../metadata/corpus-metadata-engine.js'
import type { DecisionTrace, DecisionEvent } from '@rohinik-org/kernel'

function makeTrace(overrides: Partial<DecisionTrace> = {}): DecisionTrace {
  return {
    requestId: 'req-001',
    events: [],
    reasoningInvoked: false,
    winnerTierId: 'DETERMINISTIC',
    winnerSkillId: 'csv.parse',
    ...overrides,
  }
}

function makeStorage(): CorpusStorage {
  return { write: vi.fn().mockResolvedValue(undefined), read: vi.fn(), readRange: vi.fn(), compact: vi.fn(), archive: vi.fn(), close: vi.fn() }
}

describe('CorpusWriter', () => {
  it('converts a trace to an ExecutionRecord and writes it', async () => {
    const storage = makeStorage()
    const metadata = { observe: vi.fn() } as unknown as CorpusMetadataEngine
    const writer = new CorpusWriter(storage, metadata, 'runtime-1', '0.1.0')

    await writer.onExecutionCompleted(makeTrace(), 42)

    expect(storage.write).toHaveBeenCalledOnce()
    const written = vi.mocked(storage.write).mock.calls[0][0]
    expect(written.kind).toBe('ExecutionRecord')
    expect(written.sourceTraceId).toBe('req-001')
    expect(written.totalLatencyMs).toBe(42)
    expect(written.winnerSkillId).toBe('csv.parse')
    expect(written.winnerTierId).toBe('DETERMINISTIC')
    expect(written.reasoningInvoked).toBe(false)
  })

  it('also notifies metadata engine', async () => {
    const storage = makeStorage()
    const metadata = { observe: vi.fn() } as unknown as CorpusMetadataEngine
    const writer = new CorpusWriter(storage, metadata, 'runtime-1', '0.1.0')
    await writer.onExecutionCompleted(makeTrace(), 10)
    expect(metadata.observe).toHaveBeenCalledOnce()
  })

  it('does not throw if storage write fails — write errors are non-fatal', async () => {
    const storage: CorpusStorage = { write: vi.fn().mockRejectedValue(new Error('disk full')), read: vi.fn(), readRange: vi.fn(), compact: vi.fn(), archive: vi.fn(), close: vi.fn() }
    const metadata = { observe: vi.fn() } as unknown as CorpusMetadataEngine
    const writer = new CorpusWriter(storage, metadata, 'runtime-1', '0.1.0')
    await expect(writer.onExecutionCompleted(makeTrace(), 5)).resolves.toBeUndefined()
  })

  it('generates a deterministic recordId (SHA-256 of body)', async () => {
    const written: unknown[] = []
    const storage: CorpusStorage = { write: vi.fn(r => { written.push(r); return Promise.resolve() }), read: vi.fn(), readRange: vi.fn(), compact: vi.fn(), archive: vi.fn(), close: vi.fn() }
    const metadata = { observe: vi.fn() } as unknown as CorpusMetadataEngine
    const writer = new CorpusWriter(storage, metadata, 'runtime-1', '0.1.0')
    await writer.onExecutionCompleted(makeTrace(), 5)
    const record = written[0] as { recordId: string }
    expect(record.recordId).toMatch(/^[a-f0-9]{64}$/) // SHA-256 hex
  })

  it('populates allCandidates from SKILL_SCORED events', async () => {
    const storage = makeStorage()
    const metadata = { observe: vi.fn() } as unknown as CorpusMetadataEngine
    const writer = new CorpusWriter(storage, metadata, 'runtime-1', '0.1.0')

    const events: DecisionEvent[] = [
      { version: 1, requestId: 'req-001', timestamp: new Date(), type: 'SKILL_SCORED', tierId: 'DETERMINISTIC', skillId: 'csv.parse', score: { skillId: 'csv.parse', components: [], finalScore: 0.9 } },
      { version: 1, requestId: 'req-001', timestamp: new Date(), type: 'SKILL_SCORED', tierId: 'DETERMINISTIC', skillId: 'json.parse', score: { skillId: 'json.parse', components: [], finalScore: 0.4 } },
    ]
    await writer.onExecutionCompleted(makeTrace({ events, winnerSkillId: 'csv.parse' }), 10)

    const written = vi.mocked(storage.write).mock.calls[0][0]
    expect(written.allCandidates).toHaveLength(2)
    expect(written.allCandidates[0]).toMatchObject({ skillId: 'csv.parse', tierId: 'DETERMINISTIC', score: 0.9, selected: true })
    expect(written.allCandidates[1]).toMatchObject({ skillId: 'json.parse', score: 0.4, selected: false })
  })

  it('populates providerResolutions from PROVIDER_RESOLVED events', async () => {
    const storage = makeStorage()
    const metadata = { observe: vi.fn() } as unknown as CorpusMetadataEngine
    const writer = new CorpusWriter(storage, metadata, 'runtime-1', '0.1.0')

    const events: DecisionEvent[] = [
      {
        version: 1, requestId: 'req-001', timestamp: new Date(),
        type: 'PROVIDER_RESOLVED', skillId: 'csv.parse', requirementKey: 'reasoning',
        resolution: {
          provider: { metadata: { providerId: 'anthropic', name: 'Anthropic', environments: [], capabilities: [], version: '1.0' }, isAvailable: async () => true, health: async () => ({ status: 'HEALTHY' as const }) },
          policy: 'FIRST_AVAILABLE',
          score: 1.0,
          candidates: ['anthropic'],
        },
      },
    ]
    await writer.onExecutionCompleted(makeTrace({ events }), 10)

    const written = vi.mocked(storage.write).mock.calls[0][0]
    expect(written.providerResolutions).toHaveLength(1)
    expect(written.providerResolutions[0]).toMatchObject({ requirementKey: 'reasoning', providerId: 'anthropic', providerKind: 'FIRST_AVAILABLE', resolved: true })
  })
})
