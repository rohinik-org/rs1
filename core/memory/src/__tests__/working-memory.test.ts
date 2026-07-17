import { describe, it, expect } from 'vitest'
import { WorkingMemory } from '../working/working-memory.js'

describe('WorkingMemory', () => {
  it('set and get a value', () => {
    const wm = new WorkingMemory('exec-1')
    wm.set('key', 42)
    expect(wm.get('key')).toBe(42)
  })

  it('has returns true for set key, false for missing', () => {
    const wm = new WorkingMemory('exec-1')
    wm.set('x', 'val')
    expect(wm.has('x')).toBe(true)
    expect(wm.has('y')).toBe(false)
  })

  it('clear removes all keys', () => {
    const wm = new WorkingMemory('exec-1')
    wm.set('a', 1)
    wm.set('b', 2)
    wm.clear()
    expect(wm.has('a')).toBe(false)
    expect(wm.has('b')).toBe(false)
  })

  it('two instances with same executionId are independent objects', () => {
    const wm1 = new WorkingMemory('exec-1')
    const wm2 = new WorkingMemory('exec-1')
    wm1.set('k', 'wm1')
    expect(wm2.has('k')).toBe(false)
  })

  it('executionId is accessible', () => {
    const wm = new WorkingMemory('exec-99')
    expect(wm.executionId).toBe('exec-99')
  })
})
