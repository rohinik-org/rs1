import { describe, it, expect } from 'vitest'
import { NullAuthProvider, ApiKeyAuthProvider, BearerAuthProvider } from '../auth/auth-provider.js'
import { RobotsChecker } from '../robots/robots-checker.js'
import { NullNetworkClient } from '../client/null-network-client.js'

const req = { requestId: 'r1', method: 'GET' as const, url: 'https://example.com/path', headers: {}, timeoutMs: 5000 }

describe('AuthProvider', () => {
  it('null adds no headers', () => {
    expect(new NullAuthProvider().apply(req).headers).toEqual({})
  })

  it('api key sets header', () => {
    const out = new ApiKeyAuthProvider('X-Api-Key', 'secret').apply(req)
    expect(out.headers['X-Api-Key']).toBe('secret')
  })

  it('bearer sets Authorization', () => {
    const out = new BearerAuthProvider('tok').apply(req)
    expect(out.headers['Authorization']).toBe('Bearer tok')
  })
})

describe('RobotsChecker', () => {
  it('blocks disallowed path', async () => {
    const client = new NullNetworkClient({ status: 200, body: 'User-agent: *\nDisallow: /private' })
    const checker = new RobotsChecker(client)
    expect(await checker.isAllowed('https://example.com/private/data')).toBe(false)
  })

  it('allows when robots.txt unavailable', async () => {
    const client = new NullNetworkClient({ status: 404 })
    const checker = new RobotsChecker(client)
    expect(await checker.isAllowed('https://example.com/page')).toBe(true)
  })
})
