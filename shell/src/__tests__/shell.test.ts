import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { runShell } from '../shell.js'
import type { LLMClient } from '@rohinik-org/compiler'
import type { UserIO } from '../clarification-handler.js'

function mockIO(): UserIO {
  return { ask: vi.fn().mockResolvedValue('yes'), print: vi.fn() }
}

function mockLLM(action: string, confidence = 0.9): LLMClient {
  return { complete: vi.fn().mockResolvedValue(JSON.stringify({ action, object: 'files', confidence, entities: [], constraints: [] })) }
}

const RUNTIME_RESP = { requestId: 'r1', runtimeId: 'rt-abc', state: 'READY', build: { protocolVersion: '1.0', version: '0.1.0' }, features: { memory: false, streaming: false, reasoning: true } }
const CAPS_RESP = { requestId: 'r2', capabilities: [{ skillId: 'sort.sort', name: 'Sort', tierId: 'DETERMINISTIC', version: '1.0.0' }] }
const SIM_RESP = { requestId: 'sim-1', wouldRoute: true, selectedTier: 'DETERMINISTIC', selectedSkill: 'sort.sort', confidence: 0.97, estimatedLatencyMs: 1, reasoningWouldBeInvoked: false, candidatesConsidered: [] }
const EXEC_RESP = { requestId: 'exec-1', output: [1, 2, 3], skillId: 'sort.sort', tierId: 'DETERMINISTIC', reasoningInvoked: false, confidence: 0.97, executionTimeMs: 1, explanation: 'sorted' }

describe('runShell', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()) })
  afterEach(() => { vi.unstubAllGlobals() })

  it('runs the full lifecycle and returns SUCCESS for a routable request', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: true, json: async () => RUNTIME_RESP } as Response)  // getRuntime
      .mockResolvedValueOnce({ ok: true, json: async () => RUNTIME_RESP } as Response)  // snapshot builder runtime
      .mockResolvedValueOnce({ ok: true, json: async () => CAPS_RESP } as Response)     // snapshot builder caps
      .mockResolvedValue({ ok: true, json: async () => SIM_RESP } as Response)          // simulate (multiple)

    // Override EXECUTE calls
    const originalImpl = vi.mocked(fetch).getMockImplementation()!
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      const u = typeof url === 'string' ? url : url.toString()
      if (u.includes('/v1/execute') && (init as RequestInit | undefined)?.method === 'POST') {
        return { ok: true, json: async () => EXEC_RESP } as Response
      }
      return originalImpl(url, init)
    })

    const result = await runShell('sort my files', { baseUrl: 'http://localhost:8080', llm: mockLLM('sort'), io: mockIO() })
    expect(result.success).toBe(true)
    expect(result.output).toContain('Done')
    expect(result.executionReport?.status).toBe('SUCCESS')
  })

  it('returns failure when runtime is unreachable', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('ECONNREFUSED'))
    const result = await runShell('sort files', { baseUrl: 'http://localhost:8080', llm: mockLLM('sort'), io: mockIO() })
    expect(result.success).toBe(false)
    expect(result.output).toContain('Cannot reach runtime')
  })
})
