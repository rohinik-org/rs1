import { describe, it, expect } from 'vitest'
import { NullAdapter, makeNullRequest } from '../adapter.js'

describe('NullAdapter', () => {
  const req = makeNullRequest()
  const adapter = new NullAdapter('test-id', req)

  it('returns configured id', () => {
    expect(adapter.id).toBe('test-id')
  })

  it('connect() resolves', async () => {
    await expect(adapter.connect()).resolves.toBeUndefined()
  })

  it('nextRequest() returns configured request', async () => {
    const r = await adapter.nextRequest()
    expect(r).toBe(req)
  })
})
