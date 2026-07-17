import { describe, it, expect } from 'vitest'
import { ContentTypeMatcher } from '../content-type-matcher.js'
import type { RoutingRequest } from '../../domain/request.js'
import { DEFAULT_BUDGET } from '../../domain/request.js'

function makeRequest(contentType: string): RoutingRequest {
  return {
    id: 't', content: 'x', contentType: contentType as RoutingRequest['contentType'],
    context: {}, metadata: {}, constraints: DEFAULT_BUDGET, timestamp: new Date(),
  }
}

describe('ContentTypeMatcher', () => {
  it('matches when request.contentType equals target', () => {
    const m = new ContentTypeMatcher('CSV')
    expect(m.match(makeRequest('CSV')).matched).toBe(true)
  })

  it('is case-sensitive (CSV != csv) — canonical identifiers only', () => {
    const m = new ContentTypeMatcher('CSV')
    expect(m.match(makeRequest('csv')).matched).toBe(false)
  })

  it('miss reports expected vs actual', () => {
    const m = new ContentTypeMatcher('CSV')
    const r = m.match(makeRequest('TEXT'))
    expect(r.matched).toBe(false)
    expect(r.explanation.code).toBe('MISS.CONTENT_TYPE')
  })

  it('matcherId is "content-type"', () => {
    const m = new ContentTypeMatcher('CSV')
    expect(m.match(makeRequest('CSV')).matcherId).toBe('content-type')
  })
})
