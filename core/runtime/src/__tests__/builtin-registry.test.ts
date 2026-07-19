import { describe, it, expect, vi } from 'vitest'
import { BuiltinRegistry } from '../host/builtin-registry.js'
import type { BuiltinDescriptor } from '../host/builtin-registry.js'
import type { KernelRuntime } from '@rohinik-org/kernel'

const makeDescriptor = (id: string, deps?: string[]): BuiltinDescriptor => ({
  id,
  version: '0.1.0',
  dependencies: deps,
  activate: vi.fn(),
})

describe('BuiltinRegistry', () => {
  it('registers and returns descriptors in order', () => {
    const reg = new BuiltinRegistry()
    const a = makeDescriptor('a')
    const b = makeDescriptor('b')
    reg.register(a)
    reg.register(b)
    expect(reg.getAll()).toEqual([a, b])
  })

  it('validate() passes when no dependencies declared', () => {
    const reg = new BuiltinRegistry()
    reg.register(makeDescriptor('a'))
    expect(() => reg.validate()).not.toThrow()
  })

  it('validate() passes when dependency is registered', () => {
    const reg = new BuiltinRegistry()
    reg.register(makeDescriptor('a'))
    reg.register(makeDescriptor('b', ['a']))
    expect(() => reg.validate()).not.toThrow()
  })

  it('validate() throws when dependency is missing', () => {
    const reg = new BuiltinRegistry()
    reg.register(makeDescriptor('b', ['a']))
    expect(() => reg.validate()).toThrow("Builtin 'b' declares dependency 'a' which is not registered")
  })

  it('validate() throws naming both dependent and missing id', () => {
    const reg = new BuiltinRegistry()
    reg.register(makeDescriptor('c', ['a', 'b']))
    const err = (() => { try { reg.validate() } catch (e) { return e as Error } return null })()
    expect(err?.message).toContain("'c'")
    expect(err?.message).toContain("'a'")
  })
})
