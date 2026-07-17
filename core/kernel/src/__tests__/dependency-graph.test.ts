import { describe, it, expect } from 'vitest'
import { CapabilityDependencyGraph } from '../manifest/dependency-graph.js'
import type { AiosManifest } from '@rohinik-org/foundation'

const makeManifest = (
  id: string,
  contractVersion = '1.0',
  deps?: Array<{ id: string; contractVersion: string }>,
): AiosManifest => ({
  schemaVersion: '1.0',
  runtimeVersion: '^0.1',
  type: 'capability',
  compatibility: 'stable',
  id,
  name: id,
  version: '1.0.0',
  contractVersion,
  entry: `./src/${id}.js`,
  ...(deps !== undefined ? { requiresCapabilities: deps } : {}),
})

describe('CapabilityDependencyGraph', () => {
  const graph = new CapabilityDependencyGraph()

  describe('single node', () => {
    it('returns the single manifest with no errors', () => {
      const result = graph.build([makeManifest('a')])
      expect(result.errors).toHaveLength(0)
      expect(result.order).toHaveLength(1)
      expect(result.order[0]!.id).toBe('a')
    })
  })

  describe('linear chain A → B → C', () => {
    it('returns manifests in dependency-first order', () => {
      const a = makeManifest('a', '1.0', [{ id: 'b', contractVersion: '^1.0' }])
      const b = makeManifest('b', '1.0', [{ id: 'c', contractVersion: '^1.0' }])
      const c = makeManifest('c', '1.0')
      const result = graph.build([a, b, c])
      expect(result.errors).toHaveLength(0)
      const ids = result.order.map(m => m.id)
      // c must come before b, b must come before a
      expect(ids.indexOf('c')).toBeLessThan(ids.indexOf('b'))
      expect(ids.indexOf('b')).toBeLessThan(ids.indexOf('a'))
    })
  })

  describe('diamond: A→B, A→C, B→D, C→D', () => {
    it('returns all four manifests with D first, A last', () => {
      const a = makeManifest('a', '1.0', [{ id: 'b', contractVersion: '^1.0' }, { id: 'c', contractVersion: '^1.0' }])
      const b = makeManifest('b', '1.0', [{ id: 'd', contractVersion: '^1.0' }])
      const c = makeManifest('c', '1.0', [{ id: 'd', contractVersion: '^1.0' }])
      const d = makeManifest('d', '1.0')
      const result = graph.build([a, b, c, d])
      expect(result.errors).toHaveLength(0)
      expect(result.order).toHaveLength(4)
      const ids = result.order.map(m => m.id)
      expect(ids.indexOf('d')).toBeLessThan(ids.indexOf('b'))
      expect(ids.indexOf('d')).toBeLessThan(ids.indexOf('c'))
      expect(ids.indexOf('a')).toBe(ids.length - 1)
    })
  })

  describe('cycle detection', () => {
    it('returns a CYCLE error for A→B→A', () => {
      const a = makeManifest('a', '1.0', [{ id: 'b', contractVersion: '^1.0' }])
      const b = makeManifest('b', '1.0', [{ id: 'a', contractVersion: '^1.0' }])
      const result = graph.build([a, b])
      expect(result.errors.some(e => e.type === 'CYCLE')).toBe(true)
      const cycleErr = result.errors.find(e => e.type === 'CYCLE')!
      expect(cycleErr.involvedIds).toContain('a')
      expect(cycleErr.involvedIds).toContain('b')
    })

    it('returns a CYCLE error for three-node cycle A→B→C→A', () => {
      const a = makeManifest('a', '1.0', [{ id: 'b', contractVersion: '^1.0' }])
      const b = makeManifest('b', '1.0', [{ id: 'c', contractVersion: '^1.0' }])
      const c = makeManifest('c', '1.0', [{ id: 'a', contractVersion: '^1.0' }])
      const result = graph.build([a, b, c])
      expect(result.errors.some(e => e.type === 'CYCLE')).toBe(true)
    })
  })

  describe('missing dependency', () => {
    it('returns MISSING_DEPENDENCY error when declared dep not in set', () => {
      const a = makeManifest('a', '1.0', [{ id: 'missing', contractVersion: '^1.0' }])
      const result = graph.build([a])
      expect(result.errors.some(e => e.type === 'MISSING_DEPENDENCY')).toBe(true)
      const err = result.errors.find(e => e.type === 'MISSING_DEPENDENCY')!
      expect(err.involvedIds).toContain('missing')
    })
  })

  describe('version mismatch', () => {
    it('returns VERSION_MISMATCH when contractVersion does not satisfy range', () => {
      // a requires b with contractVersion ^2.0, but b has contractVersion 1.0
      const a = makeManifest('a', '1.0', [{ id: 'b', contractVersion: '^2.0' }])
      const b = makeManifest('b', '1.0')
      const result = graph.build([a, b])
      expect(result.errors.some(e => e.type === 'VERSION_MISMATCH')).toBe(true)
      const err = result.errors.find(e => e.type === 'VERSION_MISMATCH')!
      expect(err.involvedIds).toContain('b')
    })

    it('returns VERSION_MISMATCH with an invalid-range message when dep.contractVersion is not a valid semver range', () => {
      const a = makeManifest('a', '1.0', [{ id: 'b', contractVersion: 'not-semver' }])
      const b = makeManifest('b', '1.0')
      const result = graph.build([a, b])
      expect(result.errors.some(e => e.type === 'VERSION_MISMATCH')).toBe(true)
      const err = result.errors.find(e => e.type === 'VERSION_MISMATCH')!
      expect(err.message).toContain('invalid contractVersion range')
      expect(err.message).toContain('not-semver')
      expect(err.involvedIds).toContain('b')
    })

    it('passes when contractVersion satisfies range', () => {
      const a = makeManifest('a', '1.0', [{ id: 'b', contractVersion: '^1.0' }])
      const b = makeManifest('b', '1.0')
      const result = graph.build([a, b])
      expect(result.errors).toHaveLength(0)
    })

    it('reports both CYCLE and VERSION_MISMATCH when a cycle contains a version mismatch on one edge', () => {
      // a→b (valid range), b→a (invalid range: ^2.0 but a is 1.0) — cycle + mismatch
      const a = makeManifest('a', '1.0', [{ id: 'b', contractVersion: '^1.0' }])
      const b = makeManifest('b', '1.0', [{ id: 'a', contractVersion: '^2.0' }])
      const result = graph.build([a, b])
      // Both error types are reported — the mismatch check runs before cycle detection
      expect(result.errors.some(e => e.type === 'CYCLE')).toBe(true)
      expect(result.errors.some(e => e.type === 'VERSION_MISMATCH')).toBe(true)
    })
  })

  describe('empty input', () => {
    it('returns empty order with no errors for empty input', () => {
      const result = graph.build([])
      expect(result.errors).toHaveLength(0)
      expect(result.order).toHaveLength(0)
    })
  })
})
