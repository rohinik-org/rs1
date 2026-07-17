import { describe, it, expect } from 'vitest'
import { ExactMatcher } from '../exact-matcher.js'
import type { RoutingRequest } from '../../domain/request.js'
import { DEFAULT_BUDGET } from '../../domain/request.js'

function makeRequest(intentHint: string | undefined, content = 'x', contentType = 'TEXT'): RoutingRequest {
  return {
    id: 't', content, contentType: contentType as RoutingRequest['contentType'],
    ...(intentHint !== undefined ? { intentHint } : {}),
    context: {}, metadata: {}, constraints: DEFAULT_BUDGET, timestamp: new Date(),
  }
}

describe('ExactMatcher', () => {
  it('matches identical intent hint', () => {
    const m = new ExactMatcher('read-file')
    expect(m.match(makeRequest('read-file')).matched).toBe(true)
  })

  it('is case-insensitive', () => {
    const m = new ExactMatcher('read-file')
    expect(m.match(makeRequest('READ-FILE')).matched).toBe(true)
  })

  it('miss reports expected + actual', () => {
    const m = new ExactMatcher('read-file')
    const r = m.match(makeRequest('write-file'))
    expect(r.matched).toBe(false)
    expect(r.explanation.code).toBe('MISS.EXACT')
    expect((r.explanation.data as { expected: string }).expected).toBe('read-file')
    expect((r.explanation.data as { actual: string }).actual).toBe('write-file')
  })

  it('matches contentType target', () => {
    const m = new ExactMatcher('FILE', 'contentType')
    expect(m.match(makeRequest(undefined, 'x', 'FILE')).matched).toBe(true)
    expect(m.match(makeRequest(undefined, 'x', 'TEXT')).matched).toBe(false)
  })

  it('matcherId is "exact"', () => {
    const m = new ExactMatcher('x')
    expect(m.match(makeRequest('x')).matcherId).toBe('exact')
  })
})
