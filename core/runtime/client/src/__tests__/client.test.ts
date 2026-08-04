import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RohinikHttpClient, RohinikClientError } from '../client.js'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function makeJsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response
}

beforeEach(() => { mockFetch.mockReset() })

describe('RohinikHttpClient construction', () => {
  it('defaults to localhost:8080', () => {
    const client = new RohinikHttpClient()
    expect(client.baseUrl).toBe('http://localhost:8080')
  })
  it('strips trailing slash', () => {
    const client = new RohinikHttpClient('http://example.com:9090/')
    expect(client.baseUrl).toBe('http://example.com:9090')
  })
  it('accepts explicit baseUrl', () => {
    const client = new RohinikHttpClient('http://runtime.local:4000')
    expect(client.baseUrl).toBe('http://runtime.local:4000')
  })
})

describe('getRuntime', () => {
  it('calls GET /v1/runtime', async () => {
    const expected = { requestId: 'r1', runtimeId: 'rhk-1', state: 'RUNNING', features: {}, uptime: 0 }
    mockFetch.mockResolvedValue(makeJsonResponse(expected))
    const client = new RohinikHttpClient('http://localhost:8080')
    const result = await client.getRuntime()
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:8080/v1/runtime',
      expect.objectContaining({ method: 'GET' }),
    )
    expect(result.runtimeId).toBe('rhk-1')
  })
})

describe('execute', () => {
  it('calls POST /v1/execute with JSON body', async () => {
    const req = { content: 'hello', contentType: 'TEXT' }
    const resp = { requestId: 'r2', output: 'ok', skillId: 's1', reasoningInvoked: false, confidence: 0.9, executionTimeMs: 10, explanation: '' }
    mockFetch.mockResolvedValue(makeJsonResponse(resp))
    const client = new RohinikHttpClient('http://localhost:8080')
    const result = await client.execute(req)
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:8080/v1/execute',
      expect.objectContaining({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req) }),
    )
    expect(result.skillId).toBe('s1')
  })
})

describe('error handling', () => {
  it('throws RohinikClientError on 404', async () => {
    mockFetch.mockResolvedValue(makeJsonResponse({ code: 'NOT_FOUND', message: 'not found' }, 404))
    const client = new RohinikHttpClient()
    await expect(client.getHealth()).rejects.toBeInstanceOf(RohinikClientError)
  })
  it('preserves status on error', async () => {
    mockFetch.mockResolvedValue(makeJsonResponse({ code: 'GONE', message: 'gone' }, 410))
    const client = new RohinikHttpClient()
    try { await client.getHealth() } catch (err) {
      expect((err as RohinikClientError).status).toBe(410)
    }
  })
  it('throws RohinikClientError on network failure', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'))
    const client = new RohinikHttpClient()
    await expect(client.getRuntime()).rejects.toBeInstanceOf(RohinikClientError)
  })
  it('includes baseUrl in network error', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'))
    const client = new RohinikHttpClient('http://my-runtime:9000')
    try { await client.getRuntime() } catch (err) {
      expect((err as RohinikClientError).message).toContain('http://my-runtime:9000')
    }
  })
})

describe('listCapabilities', () => {
  it('calls GET /v1/capabilities', async () => {
    mockFetch.mockResolvedValue(makeJsonResponse({ requestId: 'r3', capabilities: [] }))
    const client = new RohinikHttpClient()
    const result = await client.listCapabilities()
    expect(result.capabilities).toEqual([])
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/v1/capabilities'), expect.objectContaining({ method: 'GET' }))
  })
})

describe('acquisitionSearch', () => {
  it('calls POST /v1/acquisition/search with term', async () => {
    mockFetch.mockResolvedValue(makeJsonResponse({ requestId: 'r4', candidates: [] }))
    const client = new RohinikHttpClient()
    const result = await client.acquisitionSearch('my-skill')
    expect(result.candidates).toEqual([])
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/acquisition/search'),
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ term: 'my-skill', version: undefined }) }),
    )
  })
})
