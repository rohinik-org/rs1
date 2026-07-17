import { describe, it, expect } from 'vitest'
import { CompositeNetworkClient } from '../client/composite-network-client.js'
import { NullNetworkClient } from '../client/null-network-client.js'
import { InMemoryNetworkCache } from '../cache/network-cache.js'
import { BearerAuthProvider } from '../auth/auth-provider.js'
import { InMemoryNetworkJournal } from '../journal/network-journal.js'
import { RateLimiter } from '../rate-limit/rate-limiter.js'
import type { NetworkSecurityPolicy } from '../types/policies.js'

const req = { requestId: 'r1', method: 'GET' as const, url: 'https://example.com/path', headers: {}, timeoutMs: 5000 }
const inner = new NullNetworkClient({ status: 200, body: 'ok' })

describe('CompositeNetworkClient', () => {
  it('security blocks domain', async () => {
    const policy: NetworkSecurityPolicy = {
      blockedDomains: ['example.com'], allowedDomains: [], maxBodySizeBytes: 1_000_000,
      defaultTimeoutMs: 5000, requireHttps: false,
    }
    const client = new CompositeNetworkClient(inner, { securityPolicy: policy })
    await expect(client.request(req)).rejects.toThrow('Blocked by security policy')
  })

  it('cache hit skips inner', async () => {
    const cache = new InMemoryNetworkCache()
    const stub = { requestId: 'r1', status: 304, headers: {}, body: 'cached', receivedAt: '', latencyMs: 0 }
    cache.set('GET:https://example.com/path', stub, 60_000)
    const client = new CompositeNetworkClient(inner, { cache })
    const res = await client.request(req)
    expect(res.status).toBe(304)
  })

  it('auth header applied', async () => {
    let capturedReq = req
    const capturingClient = { request: async (r: typeof req) => { capturedReq = r; return { requestId: r.requestId, status: 200, headers: {}, body: '', receivedAt: '', latencyMs: 0 } } }
    const client = new CompositeNetworkClient(capturingClient, { authProvider: new BearerAuthProvider('tok') })
    await client.request(req)
    expect(capturedReq.headers['Authorization']).toBe('Bearer tok')
  })

  it('journal entry created', async () => {
    const journal = new InMemoryNetworkJournal()
    const client = new CompositeNetworkClient(inner, { journal })
    await client.request(req)
    expect(journal.list().some(e => e.kind === 'REQUEST_COMPLETED')).toBe(true)
  })

  it('rate limiter blocks over limit', async () => {
    const rl = new RateLimiter(1)
    rl.tryAcquire(req.url) // exhaust
    const client = new CompositeNetworkClient(inner, { rateLimiter: rl })
    await expect(client.request(req)).rejects.toThrow('Rate limited')
  })
})
