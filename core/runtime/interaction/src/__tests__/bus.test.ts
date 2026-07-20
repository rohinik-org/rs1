import { describe, it, expect } from 'vitest'
import { RuntimeInteractionBus } from '../bus.js'
import { NullAdapter, makeNullRequest } from '../adapter.js'

describe('RuntimeInteractionBus', () => {
  it('register() and get() return adapter', () => {
    const bus = new RuntimeInteractionBus()
    const adapter = new NullAdapter('test', makeNullRequest())
    bus.register(adapter)
    expect(bus.get('test')).toBe(adapter)
  })

  it('unregister() removes adapter', () => {
    const bus = new RuntimeInteractionBus()
    const adapter = new NullAdapter('test', makeNullRequest())
    bus.register(adapter)
    bus.unregister('test')
    expect(bus.get('test')).toBeUndefined()
  })

  it('list() returns all registered adapters', () => {
    const bus = new RuntimeInteractionBus()
    bus.register(new NullAdapter('a', makeNullRequest()))
    bus.register(new NullAdapter('b', makeNullRequest()))
    expect(bus.list()).toHaveLength(2)
  })

  it('get() returns undefined for unknown id', () => {
    expect(new RuntimeInteractionBus().get('nope')).toBeUndefined()
  })
})
