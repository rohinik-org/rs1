import { describe, it, expect, vi } from 'vitest'
import { SearchDriver } from '../search-driver.js'
import type { HttpSearchClient } from '../search-adapter.js'
import type { ExecutionContext } from '@rohinik-org/capability-manifest'

function ctx(): ExecutionContext {
  return { requestId: 'r', executionId: 'e', sessionId: 's', workspaceId: 'w', permissions: [] }
}

async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = []
  for await (const e of iter) out.push(e)
  return out
}

const DDG_SEARCH_HTML = `
<div class="result"><a class="result__a" href="https://example.com">Example</a>
<span class="result__snippet">An example site</span></div>
`

describe('SearchDriver', () => {
  function mockHttp(html: string): HttpSearchClient {
    return { get: vi.fn().mockResolvedValue(html) }
  }

  it('search:web → raw RESULT SearchResult[]', async () => {
    const driver = new SearchDriver(mockHttp(DDG_SEARCH_HTML))
    const events = await collect(driver.execute({ capabilityId: 'search:web', input: { query: 'test' }, context: ctx() }))
    const result = events.find(e => e.type === 'RESULT')
    expect(Array.isArray(result?.payload)).toBe(true)
  })

  it('search:web-page → raw RESULT stripped text', async () => {
    const driver = new SearchDriver(mockHttp('<html><body><p>Hello world</p></body></html>'))
    const events = await collect(driver.execute({ capabilityId: 'search:web-page', input: { url: 'https://example.com' }, context: ctx() }))
    const result = events.find(e => e.type === 'RESULT')
    expect(typeof result?.payload).toBe('string')
    expect(result?.payload as string).toContain('Hello world')
  })

  it('empty response → raw RESULT [] (not ERROR)', async () => {
    const driver = new SearchDriver(mockHttp(''))
    const events = await collect(driver.execute({ capabilityId: 'search:web', input: { query: 'nothing' }, context: ctx() }))
    const result = events.find(e => e.type === 'RESULT')
    expect(result).toBeDefined()
    expect(Array.isArray(result?.payload)).toBe(true)
    expect((result?.payload as unknown[]).length).toBe(0)
  })

  it("driver id 'search' passes grammar", () => {
    const driver = new SearchDriver(mockHttp(''))
    expect(driver.descriptor.id).toMatch(/^[a-z0-9-]+$/)
  })
})
