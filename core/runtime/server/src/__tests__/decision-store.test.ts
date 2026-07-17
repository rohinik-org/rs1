import { describe, it, expect } from 'vitest'
import { DecisionStore } from '../decision-store.js'
import type { DecisionTrace } from '@rohinik-org/kernel'

function makeTrace(requestId: string): DecisionTrace {
  return { requestId, events: [], reasoningInvoked: false }
}

describe('DecisionStore', () => {
  it('stores and retrieves a decision', () => {
    const store = new DecisionStore(100)
    const trace = makeTrace('req-1')
    store.put('req-1', trace)
    expect(store.get('req-1')?.requestId).toBe('req-1')
  })

  it('returns undefined for unknown id', () => {
    const store = new DecisionStore(100)
    expect(store.get('unknown')).toBeUndefined()
  })

  it('evicts oldest when capacity exceeded', () => {
    const store = new DecisionStore(3)
    store.put('req-1', makeTrace('req-1'))
    store.put('req-2', makeTrace('req-2'))
    store.put('req-3', makeTrace('req-3'))
    store.put('req-4', makeTrace('req-4'))
    expect(store.get('req-1')).toBeUndefined()
    expect(store.get('req-4')).toBeDefined()
  })

  it('returns correct size', () => {
    const store = new DecisionStore(100)
    store.put('req-1', makeTrace('req-1'))
    store.put('req-2', makeTrace('req-2'))
    expect(store.size).toBe(2)
  })
})
