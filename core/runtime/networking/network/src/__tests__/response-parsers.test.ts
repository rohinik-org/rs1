import { describe, it, expect } from 'vitest'
import { JsonParser, HtmlParser } from '../parsers/response-parser.js'
import { NetworkMetricsTracker } from '../metrics/network-metrics-tracker.js'
import type { NetworkJournalEntry } from '@rohinik-org/compiler'

describe('ResponseParsers', () => {
  it('JSON parses object', () => {
    expect(new JsonParser().parse('{"a":1}')).toEqual({ a: 1 })
  })

  it('HTML strips tags', () => {
    expect(new HtmlParser().parse('<h1>Hello</h1><p>World</p>')).toBe('Hello World')
  })
})

describe('NetworkMetricsTracker', () => {
  it('requestCount increments', () => {
    const entries: NetworkJournalEntry[] = [
      { requestId: 'r1', timestamp: '', kind: 'REQUEST_STARTED' },
      { requestId: 'r1', timestamp: '', kind: 'REQUEST_STARTED' },
    ]
    expect(new NetworkMetricsTracker().compute(entries).requestCount).toBe(2)
  })

  it('cacheHitRate computed', () => {
    const entries: NetworkJournalEntry[] = [
      { requestId: 'r1', timestamp: '', kind: 'REQUEST_STARTED' },
      { requestId: 'r1', timestamp: '', kind: 'CACHE_HIT' },
    ]
    expect(new NetworkMetricsTracker().compute(entries).cacheHitRate).toBe(1)
  })
})
