import { describe, it, expect } from 'vitest'
import { canonicalize, canonicalJson } from '../canonicalizer.js'

describe('canonicalize', () => {
  it('sorts object keys in UTF-16 ordinal order', () => {
    const result = canonicalize({ z: 1, a: 2, m: 3 }) as Record<string, number>
    expect(Object.keys(result)).toEqual(['a', 'm', 'z'])
  })

  it('sorts uppercase before lowercase (UTF-16 ordinal)', () => {
    // 'B' (66) < 'a' (97) in UTF-16 ordinal
    const result = canonicalize({ a: 1, B: 2 }) as Record<string, number>
    expect(Object.keys(result)).toEqual(['B', 'a'])
  })

  it('recursively sorts nested object keys', () => {
    const result = canonicalize({ z: { b: 1, a: 2 } }) as Record<string, Record<string, number>>
    expect(Object.keys(result['z']!)).toEqual(['a', 'b'])
  })

  it('preserves array element order', () => {
    const arr = [3, 1, 2]
    const result = canonicalize(arr) as number[]
    expect(result).toEqual([3, 1, 2])
  })

  it('throws on cycle detection', () => {
    const obj: Record<string, unknown> = {}
    obj['self'] = obj
    expect(() => canonicalize(obj)).toThrow(/cyclic/)
  })

  it('throws on undefined value', () => {
    expect(() => canonicalize(undefined)).toThrow(/undefined/)
  })

  it('throws on NaN', () => {
    expect(() => canonicalize(NaN)).toThrow(/non-finite/)
  })

  it('throws on Infinity', () => {
    expect(() => canonicalize(Infinity)).toThrow(/non-finite/)
  })

  it('throws on -Infinity', () => {
    expect(() => canonicalize(-Infinity)).toThrow(/non-finite/)
  })

  it('throws on non-plain prototype', () => {
    class Foo { x = 1 }
    expect(() => canonicalize(new Foo())).toThrow(/non-plain/)
  })

  it('accepts null proto objects', () => {
    const obj = Object.create(null) as Record<string, number>
    obj['b'] = 2
    obj['a'] = 1
    const result = canonicalize(obj) as Record<string, number>
    expect(Object.keys(result)).toEqual(['a', 'b'])
  })

  it('canonicalJson returns JSON string', () => {
    expect(canonicalJson({ b: 2, a: 1 })).toBe('{"a":1,"b":2}')
  })

  it('handles null', () => {
    expect(canonicalize(null)).toBe(null)
  })

  it('handles booleans', () => {
    expect(canonicalize(true)).toBe(true)
    expect(canonicalize(false)).toBe(false)
  })

  it('handles strings', () => {
    expect(canonicalize('hello')).toBe('hello')
  })
})
