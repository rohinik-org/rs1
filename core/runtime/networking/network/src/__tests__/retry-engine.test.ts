import { describe, it, expect } from 'vitest'
import { RetryEngine } from '../retry/retry-engine.js'
import { InMemoryNetworkJournal } from '../journal/network-journal.js'
import type { NetworkClient } from '../client/network-client.js'
import type { NetworkRequest, NetworkResponse } from '@rohinik-org/compiler'

const req: NetworkRequest = { requestId: 'r1', method: 'GET', url: 'https://example.com', headers: {}, timeoutMs: 5000 }
const ok: NetworkResponse = { requestId: 'r1', status: 200, headers: {}, body: 'ok', receivedAt: '', latencyMs: 0 }

const successClient: NetworkClient = { request: async () => ok }

let calls = 0
const failThenSucceed: NetworkClient = {
  request: async (r) => {
    calls++
    if (calls < 2) throw new Error('fail')
    return ok
  },
}

describe('RetryEngine', () => {
  it('no retry on success', async () => {
    const journal = new InMemoryNetworkJournal()
    const engine = new RetryEngine(successClient, 3, 0, journal)
    await engine.request(req)
    expect(journal.list().filter(e => e.kind === 'RETRY_STARTED')).toHaveLength(0)
  })

  it('retries on failure', async () => {
    calls = 0
    const engine = new RetryEngine(failThenSucceed, 3, 0)
    const res = await engine.request(req)
    expect(res.status).toBe(200)
    expect(calls).toBe(2)
  })

  it('respects maxAttempts', async () => {
    const alwaysFail: NetworkClient = { request: async () => { throw new Error('fail') } }
    const engine = new RetryEngine(alwaysFail, 2, 0)
    await expect(engine.request(req)).rejects.toThrow('fail')
  })

  it('journal records RETRY_STARTED', async () => {
    calls = 0
    const journal = new InMemoryNetworkJournal()
    const engine = new RetryEngine(failThenSucceed, 3, 0, journal)
    await engine.request(req)
    expect(journal.list().some(e => e.kind === 'RETRY_STARTED')).toBe(true)
  })

  it('journal list returns all entries', () => {
    const journal = new InMemoryNetworkJournal()
    journal.record({ requestId: 'r1', timestamp: '', kind: 'REQUEST_STARTED' })
    journal.record({ requestId: 'r1', timestamp: '', kind: 'REQUEST_COMPLETED' })
    expect(journal.list()).toHaveLength(2)
  })
})
