import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ContextAssembler } from '../context-assembler.js'

describe('ContextAssembler', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()) })
  afterEach(() => { vi.unstubAllGlobals() })

  it('assembles a CompilerContext from live runtime data', async () => {
    vi.mocked(fetch)
      // RohinikHttpClient.getRuntime()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ requestId: 'r1', runtimeId: 'rt-abc', state: 'READY', build: { protocolVersion: '1.0' }, features: { memory: false, streaming: false, reasoning: true } }) } as Response)
      // CapabilitySnapshotBuilder: GET /v1/runtime
      .mockResolvedValueOnce({ ok: true, json: async () => ({ runtimeId: 'rt-abc', state: 'READY', build: { protocolVersion: '1.0' }, features: {} }) } as Response)
      // CapabilitySnapshotBuilder: GET /v1/capabilities
      .mockResolvedValueOnce({ ok: true, json: async () => ({ requestId: 'r2', capabilities: [{ skillId: 'sort.sort', name: 'Sort', tierId: 'DETERMINISTIC', version: '1.0.0' }] }) } as Response)

    const assembler = new ContextAssembler('http://localhost:8080')
    const ctx = await assembler.assemble()

    expect(ctx.system.runtime.runtimeId).toBe('rt-abc')
    expect(ctx.system.capabilities.skills).toHaveLength(1)
    expect(ctx.policy.verificationMode).toBe('strict')
    expect(ctx.session.sessionId).toBeTruthy()
  })

  it('merges policy overrides with defaults', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ runtimeId: 'rt-1', state: 'READY', build: { protocolVersion: '1.0' }, features: {} }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ runtimeId: 'rt-1', state: 'READY', build: { protocolVersion: '1.0' }, features: {} }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ capabilities: [] }) } as Response)

    const ctx = await new ContextAssembler('http://localhost:8080').assemble({ clarificationThreshold: 0.85 })
    expect(ctx.policy.clarificationThreshold).toBe(0.85)
    expect(ctx.policy.verificationMode).toBe('strict')
  })
})
