import { describe, it, expect } from 'vitest'
import { canonicalize, sha256Hex } from '../canonicalize.js'

describe('canonicalize', () => {
  it('sorts object keys recursively at every depth', () => {
    const v = { z: { b: 1, a: 2 }, a: { y: 3, x: 4 } }
    expect(canonicalize(v)).toBe('{"a":{"x":4,"y":3},"z":{"a":2,"b":1}}')
  })

  it('preserves array element order (does not sort arrays)', () => {
    expect(canonicalize([3, 1, 2])).toBe('[3,1,2]')
    expect(canonicalize([{ b: 1 }, { a: 2 }])).toBe('[{"b":1},{"a":2}]')
  })

  it('proves JSON.stringify does NOT sort nested keys, canonicalize does', () => {
    // Object with deliberately reversed nested keys
    const v = { z: 1, a: { y: 2, x: 3 } }
    // JSON.stringify preserves insertion order at every level
    expect(JSON.stringify(v)).toBe('{"z":1,"a":{"y":2,"x":3}}')
    // canonicalize sorts keys at BOTH levels
    expect(canonicalize(v)).toBe('{"a":{"x":3,"y":2},"z":1}')
  })

  it('produces same canonical string regardless of key insertion order', () => {
    const v1 = { a: 1, b: 2, c: 3 }
    const v2 = { c: 3, a: 1, b: 2 }
    const v3 = { b: 2, c: 3, a: 1 }
    expect(canonicalize(v1)).toBe(canonicalize(v2))
    expect(canonicalize(v2)).toBe(canonicalize(v3))
  })

  it('preserves null values in objects', () => {
    expect(canonicalize({ a: null, b: 'x' })).toBe('{"a":null,"b":"x"}')
  })

  it('uses code-unit ordering: Z (90) sorts before a (97)', () => {
    const v = { a: 1, Z: 2 }
    expect(canonicalize(v)).toBe('{"Z":2,"a":1}')
  })

  it('throws on undefined', () => {
    expect(() => canonicalize(undefined)).toThrow("unsupported type 'undefined'")
  })

  it('throws on NaN', () => {
    expect(() => canonicalize(NaN)).toThrow('non-finite number')
  })

  it('throws on Infinity', () => {
    expect(() => canonicalize(Infinity)).toThrow('non-finite number')
    expect(() => canonicalize(-Infinity)).toThrow('non-finite number')
  })

  it('throws on Date (non-plain object)', () => {
    expect(() => canonicalize(new Date())).toThrow('non-plain object (Date)')
  })

  it('throws on Map (non-plain object)', () => {
    expect(() => canonicalize(new Map())).toThrow('non-plain object (Map)')
  })

  it('throws on cyclic structure before hitting JSON.stringify', () => {
    const obj: Record<string, unknown> = {}
    obj['self'] = obj
    expect(() => canonicalize(obj)).toThrow('cyclic structure')
  })
})

describe('sha256Hex', () => {
  it('returns a 64-char hex string', () => {
    const h = sha256Hex(canonicalize({ a: 1 }))
    expect(h).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is deterministic — same input, same hash', () => {
    const v = { z: 1, a: 2 }
    expect(sha256Hex(canonicalize(v))).toBe(sha256Hex(canonicalize(v)))
  })
})
