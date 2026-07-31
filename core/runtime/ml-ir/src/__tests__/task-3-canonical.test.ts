import { describe, it, expect } from 'vitest'
import {
  ML_CANONICALIZATION_VERSION,
  canonicalMlJson,
  canonicalMlHash,
  type CanonicalMlEnvelope,
} from '../../src/index.js'

// ── envelope shape ────────────────────────────────────────────────────────────

describe('CanonicalMlEnvelope', () => {
  it('wraps payload with contract type, schema version, and canon version', () => {
    const env: CanonicalMlEnvelope<{ x: number }> = {
      $contractType: 'ModelSpec',
      $schemaVersion: '1.0.0',
      $canonicalizationVersion: ML_CANONICALIZATION_VERSION,
      payload: { x: 1 },
    }
    expect(env.$contractType).toBe('ModelSpec')
    expect(env.$canonicalizationVersion).toBe(ML_CANONICALIZATION_VERSION)
  })
})

// ── canonicalMlJson: order invariance ─────────────────────────────────────────

describe('canonicalMlJson: object key ordering', () => {
  it('nested objects produce same JSON regardless of insertion order', () => {
    const a = { z: 1, a: { z: 2, a: 3 } }
    const b = { a: { a: 3, z: 2 }, z: 1 }
    expect(canonicalMlJson(a)).toBe(canonicalMlJson(b))
  })

  it('sorted keys appear in lexicographic order', () => {
    const result = canonicalMlJson({ z: 1, m: 2, a: 3 })
    expect(result).toBe('{"a":3,"m":2,"z":1}')
  })
})

// ── ordered arrays: sequence matters ──────────────────────────────────────────

describe('canonicalMlJson: array order sensitivity', () => {
  it('[1,2,3] and [3,2,1] produce different JSON', () => {
    expect(canonicalMlJson([1, 2, 3])).not.toBe(canonicalMlJson([3, 2, 1]))
  })

  it('preserves array order (arrays are NOT sorted)', () => {
    expect(canonicalMlJson([3, 1, 2])).toBe('[3,1,2]')
  })
})

// ── primitives and null ───────────────────────────────────────────────────────

describe('canonicalMlJson: primitives', () => {
  it('serializes string', () => { expect(canonicalMlJson('hello')).toBe('"hello"') })
  it('serializes number', () => { expect(canonicalMlJson(42)).toBe('42') })
  it('serializes boolean true', () => { expect(canonicalMlJson(true)).toBe('true') })
  it('serializes boolean false', () => { expect(canonicalMlJson(false)).toBe('false') })
  it('preserves null', () => { expect(canonicalMlJson(null)).toBe('null') })
})

// ── Unicode ───────────────────────────────────────────────────────────────────

describe('canonicalMlJson: Unicode', () => {
  it('round-trips Unicode string correctly', () => {
    const v = { key: '日本語テスト🚀' }
    const json = canonicalMlJson(v)
    expect(JSON.parse(json)).toEqual(v)
  })

  it('sorts keys with Unicode chars lexicographically', () => {
    const v = { β: 2, α: 1 }
    expect(canonicalMlJson(v)).toBe('{"α":1,"β":2}')
  })
})

// ── mutation sensitivity ──────────────────────────────────────────────────────

describe('canonicalMlHash: mutation sensitivity', () => {
  it('any nested field mutation changes hash', () => {
    const a = { model: { id: 'm-1', version: '1.0.0', meta: { region: 'us' } } }
    const b = { model: { id: 'm-1', version: '1.0.0', meta: { region: 'eu' } } }
    expect(canonicalMlHash(a)).not.toBe(canonicalMlHash(b))
  })

  it('schema version mutation changes hash', () => {
    const env1: CanonicalMlEnvelope<{ v: number }> = {
      $contractType: 'T',
      $schemaVersion: '1.0.0',
      $canonicalizationVersion: ML_CANONICALIZATION_VERSION,
      payload: { v: 1 },
    }
    const env2 = { ...env1, $schemaVersion: '1.0.1' }
    expect(canonicalMlHash(env1)).not.toBe(canonicalMlHash(env2))
  })

  it('contract type mutation changes hash', () => {
    const env1: CanonicalMlEnvelope<{ v: number }> = {
      $contractType: 'TypeA',
      $schemaVersion: '1.0.0',
      $canonicalizationVersion: ML_CANONICALIZATION_VERSION,
      payload: { v: 1 },
    }
    const env2 = { ...env1, $contractType: 'TypeB' }
    expect(canonicalMlHash(env1)).not.toBe(canonicalMlHash(env2))
  })
})

// ── determinism ───────────────────────────────────────────────────────────────

describe('canonicalMlHash: determinism', () => {
  it('same object produces same hash on repeated calls', () => {
    const v = { b: 2, a: 1 }
    expect(canonicalMlHash(v)).toBe(canonicalMlHash(v))
  })

  it('hash format is sha256:<64 lowercase hex>', () => {
    const h = canonicalMlHash({ x: 1 })
    expect(h).toMatch(/^sha256:[0-9a-f]{64}$/)
  })
})

// ── invalid value rejection ───────────────────────────────────────────────────

describe('canonicalMlJson: invalid values', () => {
  it('throws on undefined', () => {
    expect(() => canonicalMlJson(undefined as unknown)).toThrow()
  })

  it('throws on bigint', () => {
    expect(() => canonicalMlJson(BigInt(1) as unknown)).toThrow()
  })

  it('throws on symbol', () => {
    expect(() => canonicalMlJson(Symbol('s') as unknown)).toThrow()
  })

  it('throws on function', () => {
    expect(() => canonicalMlJson((() => {}) as unknown)).toThrow()
  })

  it('throws on NaN', () => {
    expect(() => canonicalMlJson(NaN)).toThrow()
  })

  it('throws on Infinity', () => {
    expect(() => canonicalMlJson(Infinity)).toThrow()
  })

  it('throws on negative zero', () => {
    expect(() => canonicalMlJson(-0)).toThrow()
  })

  it('throws on sparse array', () => {
    // eslint-disable-next-line no-sparse-arrays
    expect(() => canonicalMlJson([1, , 3] as unknown)).toThrow()
  })

  it('throws on Date (non-plain object)', () => {
    expect(() => canonicalMlJson(new Date() as unknown)).toThrow()
  })

  it('throws on Map (non-plain object)', () => {
    expect(() => canonicalMlJson(new Map() as unknown)).toThrow()
  })

  it('throws on cyclic object', () => {
    const a: Record<string, unknown> = {}
    a['self'] = a
    expect(() => canonicalMlJson(a)).toThrow()
  })
})

// ── golden hashes ─────────────────────────────────────────────────────────────
// These fixtures lock the canonical output forever.
// To regenerate: delete and re-run once, then commit the new values.

describe('golden hash vectors', () => {
  it('empty object {}', () => {
    expect(canonicalMlHash({})).toBe(
      'sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a'
    )
  })

  it('flat object {a:1,b:2}', () => {
    expect(canonicalMlHash({ a: 1, b: 2 })).toBe(
      'sha256:43258cff783fe7036d8a43033f830adfc60ec037382473548ac742b888292777'
    )
  })

  it('empty array []', () => {
    expect(canonicalMlHash([])).toBe(
      'sha256:4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945'
    )
  })

  it('null', () => {
    expect(canonicalMlHash(null)).toBe(
      'sha256:74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b'
    )
  })
})
