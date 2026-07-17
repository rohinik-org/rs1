import { describe, it, expect } from 'vitest'
import { AllOfMatcher, AnyOfMatcher } from '../combinators.js'
import { KeywordMatcher } from '../keyword-matcher.js'
import { ContentTypeMatcher } from '../content-type-matcher.js'
import type { RoutingRequest } from '../../domain/request.js'
import { DEFAULT_BUDGET } from '../../domain/request.js'

function makeRequest(intentHint: string, contentType: string): RoutingRequest {
  return {
    id: 't', content: 'x', contentType: contentType as RoutingRequest['contentType'],
    intentHint,
    context: {}, metadata: {}, constraints: DEFAULT_BUDGET, timestamp: new Date(),
  }
}

describe('AllOfMatcher', () => {
  it('matches when every child matches', () => {
    const m = new AllOfMatcher(
      new KeywordMatcher(['csv']),
      new ContentTypeMatcher('CSV'),
    )
    expect(m.match(makeRequest('parse csv', 'CSV')).matched).toBe(true)
  })

  it('short-circuits on first miss', () => {
    const m = new AllOfMatcher(
      new KeywordMatcher(['csv']),
      new ContentTypeMatcher('CSV'),
    )
    const r = m.match(makeRequest('parse csv', 'TEXT'))
    expect(r.matched).toBe(false)
    expect(r.explanation.code).toBe('MISS.ALL_REQUIRED')
    expect((r.explanation.data as { failedChild: string }).failedChild).toBe('content-type')
  })

  it('rawConfidence is product of child confidences', () => {
    const m = new AllOfMatcher(
      new KeywordMatcher(['csv']),
      new ContentTypeMatcher('CSV'),
    )
    const r = m.match(makeRequest('parse csv', 'CSV'))
    // both children return 1.0 -> product 1.0
    expect(r.rawConfidence).toBe(1.0)
  })

  it('constructor throws on empty child list', () => {
    expect(() => new AllOfMatcher()).toThrow('at least one child')
  })

  it('children array is frozen (matchers.push() throws)', () => {
    const m = new AllOfMatcher(new KeywordMatcher(['x']))
    expect(Object.isFrozen(m.matchers)).toBe(true)
    expect(() => (m.matchers as unknown as Array<unknown>).push({})).toThrow()
  })
})

describe('AnyOfMatcher', () => {
  it('matches when any child matches', () => {
    const m = new AnyOfMatcher(
      new ContentTypeMatcher('JSON'),
      new KeywordMatcher(['json']),
    )
    expect(m.match(makeRequest('read the json', 'TEXT')).matched).toBe(true)
    expect(m.match(makeRequest('unrelated', 'JSON')).matched).toBe(true)
  })

  it('miss when no child matches', () => {
    const m = new AnyOfMatcher(
      new KeywordMatcher(['json']),
      new ContentTypeMatcher('JSON'),
    )
    const r = m.match(makeRequest('sort me', 'TEXT'))
    expect(r.matched).toBe(false)
    expect(r.explanation.code).toBe('MISS.ANY')
  })

  it('rawConfidence is max of matching children', () => {
    const m = new AnyOfMatcher(
      new KeywordMatcher(['json']),
      new ContentTypeMatcher('JSON'),
    )
    const r = m.match(makeRequest('read json', 'JSON'))
    expect(r.rawConfidence).toBe(1.0)
  })

  it('reports MATCH.ANY with best child code', () => {
    const m = new AnyOfMatcher(new KeywordMatcher(['json']))
    const r = m.match(makeRequest('read json', 'TEXT'))
    expect(r.explanation.code).toBe('MATCH.ANY')
    expect((r.explanation.data as { bestChildCode: string }).bestChildCode).toBe('MATCH.KEYWORD')
  })

  it('children array is frozen', () => {
    const m = new AnyOfMatcher(new KeywordMatcher(['x']))
    expect(Object.isFrozen(m.matchers)).toBe(true)
  })
})
