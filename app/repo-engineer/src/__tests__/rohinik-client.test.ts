import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RohinikClient } from '../client/rohinik-client.js'
import { RohinikError } from '../client/types.js'

const mockFetch = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch)
  mockFetch.mockReset()
})

function okJson(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function errorJson(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('RohinikClient', () => {
  const client = new RohinikClient({ endpoint: 'http://localhost:8080', timeoutMs: 5000 })

  describe('health()', () => {
    it('returns parsed health response', async () => {
      mockFetch.mockResolvedValueOnce(okJson({ status: 'HEALTHY', state: 'READY', checks: [], requestId: 'r1', runtimeId: 'x', uptimeMs: 100, timestamp: 1 }))
      const res = await client.health()
      expect(res.status).toBe('HEALTHY')
      expect(res.state).toBe('READY')
    })
  })

  describe('execute()', () => {
    it('sends correct body and returns response', async () => {
      mockFetch.mockResolvedValueOnce(okJson({
        requestId: 'req-1', output: '[mock] echo: hello', skillId: 'builtin:reasoning',
        tierId: 'REASONING', reasoningInvoked: true, confidence: 0.5, executionTimeMs: 10,
        resourceCost: { estimated: { cpuMs: 0 } }, explanation: null,
      }))

      const res = await client.execute({ content: 'hello', contentType: 'TEXT', constraints: { allowReasoning: true } })

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/v1/execute',
        expect.objectContaining({ method: 'POST' }),
      )
      expect(res.requestId).toBe('req-1')
      expect(res.output).toBe('[mock] echo: hello')
      expect(res.tierId).toBe('REASONING')
    })

    it('throws RohinikError on 400', async () => {
      mockFetch.mockResolvedValueOnce(errorJson({ code: 'INVALID_REQUEST', message: 'content required' }, 400))
      await expect(client.execute({ content: '', contentType: 'TEXT' })).rejects.toThrow(RohinikError)
      mockFetch.mockResolvedValueOnce(errorJson({ code: 'INVALID_REQUEST', message: 'content required' }, 400))
      await expect(client.execute({ content: '', contentType: 'TEXT' })).rejects.toMatchObject({ code: 'INVALID_REQUEST', status: 400 })
    })

    it('throws RohinikError with NETWORK_ERROR on fetch failure', async () => {
      mockFetch.mockRejectedValueOnce(new TypeError('network failure'))
      await expect(client.execute({ content: 'x', contentType: 'TEXT' })).rejects.toMatchObject({ code: 'NETWORK_ERROR' })
    })
  })

  describe('getDecision()', () => {
    it('fetches decision by requestId', async () => {
      mockFetch.mockResolvedValueOnce(okJson({ requestId: 'req-1', trace: { events: [] } }))
      const res = await client.getDecision('req-1')
      expect(res.requestId).toBe('req-1')
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/v1/decisions/req-1',
        expect.objectContaining({ method: 'GET' }),
      )
    })

    it('throws RohinikError on 404', async () => {
      mockFetch.mockResolvedValueOnce(errorJson({ code: 'NOT_FOUND', message: 'unknown' }, 404))
      await expect(client.getDecision('missing')).rejects.toMatchObject({ status: 404 })
    })
  })

  describe('simulate()', () => {
    it('returns simulate response', async () => {
      mockFetch.mockResolvedValueOnce(okJson({ requestId: 'r2', wouldRoute: true, selectedSkill: 'builtin:reasoning', confidence: 0.5, candidatesConsidered: [] }))
      const res = await client.simulate({ content: 'test', contentType: 'TEXT' }) as { wouldRoute: boolean }
      expect(res.wouldRoute).toBe(true)
    })
  })

  describe('trailing slash normalisation', () => {
    it('strips trailing slash from endpoint', async () => {
      const c = new RohinikClient({ endpoint: 'http://localhost:8080/' })
      mockFetch.mockResolvedValueOnce(okJson({ status: 'HEALTHY', state: 'READY', checks: [], requestId: 'r', runtimeId: 'x', uptimeMs: 0, timestamp: 0 }))
      await c.health()
      expect((mockFetch.mock.calls[0] as unknown[])[0]).toBe('http://localhost:8080/v1/health')
    })
  })
})
