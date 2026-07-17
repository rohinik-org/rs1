import { describe, it, expect } from 'vitest'
import type { CapabilityQuery } from '@rohinik-org/compiler'
import { NullCapabilitySource } from '../sources/null-capability-source.js'

function makeQuery(overrides: Partial<CapabilityQuery> = {}): CapabilityQuery {
  return {
    queryId: 'q-1',
    triggerId: 'trig-1',
    searchTerms: ['pdf', 'ocr'],
    producedAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('NullCapabilitySource', () => {
  it('discover returns empty array', async () => {
    const source = new NullCapabilitySource()
    const results = await source.discover(makeQuery())
    expect(results).toEqual([])
  })

  it('sourceId is set', () => {
    const source = new NullCapabilitySource()
    expect(source.sourceId).toBe('null')
  })

  it('returns empty regardless of query terms', async () => {
    const source = new NullCapabilitySource()
    const results = await source.discover(makeQuery({ searchTerms: ['image', 'processing'] }))
    expect(results).toHaveLength(0)
  })
})
