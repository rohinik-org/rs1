import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CapabilitySnapshotBuilder } from '../snapshot-builder.js'

describe('CapabilitySnapshotBuilder', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()) })
  afterEach(() => { vi.unstubAllGlobals() })

  it('builds a CapabilitySnapshot from GET /v1/capabilities response', async () => {
    const mockCapabilities = {
      requestId: 'req-1',
      capabilities: [
        { skillId: 'csv.parse', name: 'CSV Parse', tierId: 'DETERMINISTIC', version: '1.0.0' },
        { skillId: 'sort.sort', name: 'Sort', tierId: 'DETERMINISTIC', version: '1.0.0' },
      ],
    }
    const mockRuntime = {
      requestId: 'req-2', runtimeId: 'rt-abc',
      build: { protocolVersion: '1.0' },
      features: { memory: false, streaming: false, reasoning: true },
      state: 'READY',
    }
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: true, json: async () => mockRuntime } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => mockCapabilities } as Response)

    const builder = new CapabilitySnapshotBuilder('http://localhost:8080')
    const snapshot = await builder.build('sess-1', 'snap-1')

    expect(snapshot.meta.kind).toBe('CapabilitySnapshot')
    expect(snapshot.skills).toHaveLength(2)
    expect(snapshot.skills[0]!.skillId).toBe('csv.parse')
    expect(snapshot.skills[0]!.semantics).toContain('csv.parse')
    expect(snapshot.runtimeId).toBe('rt-abc')
    expect(snapshot.snapshotId).toBeTruthy()
    expect(snapshot.source).toBe('GET /v1/capabilities')
  })

  it('throws when runtime is not READY', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true, json: async () => ({ runtimeId: 'rt-1', build: { protocolVersion: '1.0' }, features: {}, state: 'STARTING' }),
    } as Response)
    const builder = new CapabilitySnapshotBuilder('http://localhost:8080')
    await expect(builder.build('s', 'snap')).rejects.toThrow('Runtime is not READY')
  })
})
