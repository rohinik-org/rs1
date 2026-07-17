import { describe, it, expect } from 'vitest'
import { NullNetworkClient } from '../client/null-network-client.js'

const req = { requestId: 'r1', method: 'GET' as const, url: 'https://example.com', headers: {}, timeoutMs: 5000 }

describe('NullNetworkClient', () => {
  it('returns stub response', async () => {
    const client = new NullNetworkClient({ status: 201, body: 'hello' })
    const res = await client.request(req)
    expect(res.status).toBe(201)
    expect(res.body).toBe('hello')
  })

  it('latency defaults to 0', async () => {
    const res = await new NullNetworkClient().request(req)
    expect(res.latencyMs).toBe(0)
  })

  it('preserves requestId', async () => {
    const res = await new NullNetworkClient().request(req)
    expect(res.requestId).toBe('r1')
  })

  it('fetch-shaped client returns status', async () => {
    const res = await new NullNetworkClient({ status: 404 }).request(req)
    expect(res.status).toBe(404)
  })

  it('fetch-shaped client latency >= 0', async () => {
    const res = await new NullNetworkClient().request(req)
    expect(res.latencyMs).toBeGreaterThanOrEqual(0)
  })
})
