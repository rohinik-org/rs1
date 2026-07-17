import { describe, it, expect } from 'vitest'
import { RateLimiter } from '../rate-limit/rate-limiter.js'
import { NullNetworkCache, InMemoryNetworkCache } from '../cache/network-cache.js'

const stub = { requestId: 'r1', status: 200, headers: {}, body: 'ok', receivedAt: '', latencyMs: 0 }

describe('RateLimiter', () => {
  it('allows request under limit', () => {
    const rl = new RateLimiter(10)
    expect(rl.tryAcquire('https://example.com/path')).toBe(true)
  })

  it('blocks request over limit', () => {
    const rl = new RateLimiter(2)
    rl.tryAcquire('https://example.com')
    rl.tryAcquire('https://example.com')
    expect(rl.tryAcquire('https://example.com')).toBe(false)
  })
})

describe('NetworkCache', () => {
  it('null cache always misses', () => {
    expect(new NullNetworkCache().get('x')).toBeUndefined()
  })

  it('in-memory cache hit returns response', () => {
    const cache = new InMemoryNetworkCache()
    cache.set('x', stub, 60_000)
    expect(cache.get('x')).toBe(stub)
  })

  it('expired entry is a miss', async () => {
    const cache = new InMemoryNetworkCache()
    cache.set('x', stub, 1)
    await new Promise(r => setTimeout(r, 5))
    expect(cache.get('x')).toBeUndefined()
  })
})
