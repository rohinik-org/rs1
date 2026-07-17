import { describe, it, expect } from 'vitest'
import { KeywordMatcher } from '../keyword-matcher.js'
import type { RoutingRequest } from '../../domain/request.js'
import { DEFAULT_BUDGET } from '../../domain/request.js'

function makeRequest(intentHint: string | undefined, content = 'x', contentType = 'TEXT'): RoutingRequest {
  return {
    id: 'test',
    content,
    contentType: contentType as RoutingRequest['contentType'],
    ...(intentHint !== undefined ? { intentHint } : {}),
    context: {},
    metadata: {},
    constraints: DEFAULT_BUDGET,
    timestamp: new Date(),
  }
}

describe('KeywordMatcher — basic', () => {
  it('matches when a keyword appears as a whole word', () => {
    const m = new KeywordMatcher(['sort', 'order', 'rank'])
    const r = m.match(makeRequest('please sort these'))
    expect(r.matched).toBe(true)
    expect(r.rawConfidence).toBe(1.0)
    expect(r.matcherId).toBe('keyword')
    expect(r.explanation.code).toBe('MATCH.KEYWORD')
    expect((r.explanation.data as { keyword: string }).keyword).toBe('sort')
  })

  it('is case-insensitive', () => {
    const m = new KeywordMatcher(['sort'])
    expect(m.match(makeRequest('SORT this')).matched).toBe(true)
    expect(m.match(makeRequest('Sort THIS')).matched).toBe(true)
  })

  it('miss on empty intent', () => {
    const m = new KeywordMatcher(['add'])
    expect(m.match(makeRequest(undefined)).matched).toBe(false)
    expect(m.match(makeRequest('')).matched).toBe(false)
  })

  it('miss reports the keyword list', () => {
    const m = new KeywordMatcher(['add', 'sum'])
    const r = m.match(makeRequest('multiply'))
    expect(r.matched).toBe(false)
    expect(r.explanation.code).toBe('MISS.KEYWORD')
    expect((r.explanation.data as { keywords: string[] }).keywords).toEqual(['add', 'sum'])
  })

  it('constructor throws on empty keyword list', () => {
    expect(() => new KeywordMatcher([])).toThrow('at least one keyword')
  })

  it('is immutable — keywords array is frozen', () => {
    const m = new KeywordMatcher(['sort'])
    expect(Object.isFrozen(m.keywords)).toBe(true)
    expect(() => (m.keywords as string[]).push('order')).toThrow()
  })

  it('populates evidence with matched token and target', () => {
    const m = new KeywordMatcher(['sort'])
    const r = m.match(makeRequest('please sort me'))
    expect(r.evidence).toBeDefined()
    expect((r.evidence as { matchedToken: string }).matchedToken).toBe('sort')
    expect((r.evidence as { target: string }).target).toBe('intentHint')
  })
})

describe('KeywordMatcher — adversarial (FINDING-2 regression guards)', () => {
  const cases: Array<[string, string, boolean, string]> = [
    ['add', 'addition', false, 'addition should not match add'],
    ['add', 'additional', false, 'additional should not match add'],
    ['sum', 'summarize', false, 'summarize should not match sum'],
    ['sum', 'summary', false, 'summary should not match sum'],
    ['sort', 'sorting', false, 'sorting should not match sort'],
    ['sort', 'sorted', false, 'sorted should not match sort'],
    ['order', 'ordered', false, 'ordered should not match order'],
    ['subtract', 'subtraction', false, 'subtraction should not match subtract'],
    ['multiply', 'multiplication', false, 'multiplication should not match multiply'],
    ['divide', 'division', false, 'division should not match divide'],
    ['divide', 'divided', false, 'divided should not match divide'],
    // Punctuation variants that SHOULD match
    ['sort', 'sort.', true, 'sort. should match sort (trailing period)'],
    ['sort', 'sort!', true, 'sort! should match sort'],
    ['sort', 'sort?', true, 'sort? should match sort'],
    ['sort', 'sort,', true, 'sort, should match sort'],
    ['add', 'please add these', true, 'add appearing as whole word matches'],
  ]

  for (const [keyword, intent, expected, label] of cases) {
    it(label, () => {
      const m = new KeywordMatcher([keyword])
      expect(m.match(makeRequest(intent)).matched).toBe(expected)
    })
  }
})

describe('KeywordMatcher — content target', () => {
  it('can match against request.content instead of intentHint', () => {
    const m = new KeywordMatcher(['csv'], 'content')
    const r = m.match(makeRequest('unrelated', 'this is csv data'))
    expect(r.matched).toBe(true)
  })
})
