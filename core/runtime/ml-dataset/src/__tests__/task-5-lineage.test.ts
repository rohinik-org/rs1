import { describe, it, expect } from 'vitest'
import type { DatasetId } from '@rohinik-org/ml-ir'
import {
  DatasetLineageGraph,
  validateLineageNode,
  type LineageInsertResult,
  type LineageTraversalOrder,
} from '../../src/index.js'
import type { LineageNode } from '../../src/index.js'

// ── fixtures ──────────────────────────────────────────────────────────────────

const d = (id: string) => id as DatasetId
const HASH = (s: string) => `sha256:${s.padEnd(64, '0')}` as import('@rohinik-org/ml-ir').ContentHash

const SOURCE_A: LineageNode = {
  datasetId: d('ds-a'),
  parentDatasetIds: [],
  lineageHash: HASH('aaa'),
  recordedAt: '2024-01-01T00:00:00.000Z' as import('../../src/index.js').DatasetIsoTimestamp,
}

const SOURCE_B: LineageNode = {
  datasetId: d('ds-b'),
  parentDatasetIds: [],
  lineageHash: HASH('bbb'),
  recordedAt: '2024-01-01T00:00:00.000Z' as import('../../src/index.js').DatasetIsoTimestamp,
}

const DERIVED_C: LineageNode = {
  datasetId: d('ds-c'),
  parentDatasetIds: [d('ds-a'), d('ds-b')],
  transformationId: 'tx-1',
  lineageHash: HASH('ccc'),
  recordedAt: '2024-01-02T00:00:00.000Z' as import('../../src/index.js').DatasetIsoTimestamp,
}

const DERIVED_D: LineageNode = {
  datasetId: d('ds-d'),
  parentDatasetIds: [d('ds-c')],
  transformationId: 'tx-2',
  lineageHash: HASH('ddd'),
  recordedAt: '2024-01-03T00:00:00.000Z' as import('../../src/index.js').DatasetIsoTimestamp,
}

// ── validateLineageNode ────────────────────────────────────────────────────────

describe('validateLineageNode', () => {
  it('accepts source node (no parents)', () => {
    expect(() => validateLineageNode(SOURCE_A, new Set())).not.toThrow()
  })

  it('accepts derived node when parents exist', () => {
    const existing = new Set([d('ds-a'), d('ds-b')])
    expect(() => validateLineageNode(DERIVED_C, existing)).not.toThrow()
  })

  it('rejects self-referential parent', () => {
    const self: LineageNode = {
      datasetId: d('ds-x'),
      parentDatasetIds: [d('ds-x')],
      lineageHash: HASH('xxx'),
      recordedAt: '2024-01-01T00:00:00.000Z' as import('../../src/index.js').DatasetIsoTimestamp,
    }
    expect(() => validateLineageNode(self, new Set([d('ds-x')]))).toThrow(/self/)
  })

  it('rejects missing parent (parent not in existing set)', () => {
    expect(() => validateLineageNode(DERIVED_C, new Set([d('ds-a')]))).toThrow(/missing/)
  })
})

// ── DatasetLineageGraph: source roots ─────────────────────────────────────────

describe('DatasetLineageGraph: source roots', () => {
  it('single source node has no parents and is a root', () => {
    const g = new DatasetLineageGraph()
    const r = g.insert(SOURCE_A)
    expect(r.inserted).toBe(true)
    expect(g.findRoots(d('ds-a'))).toEqual([d('ds-a')])
  })

  it('two source nodes are independent roots', () => {
    const g = new DatasetLineageGraph()
    g.insert(SOURCE_A)
    g.insert(SOURCE_B)
    expect(g.findRoots(d('ds-a'))).toEqual([d('ds-a')])
    expect(g.findRoots(d('ds-b'))).toEqual([d('ds-b')])
  })
})

// ── DatasetLineageGraph: single-parent derived ────────────────────────────────

describe('DatasetLineageGraph: derived nodes', () => {
  it('one-parent derived traces to single root', () => {
    const g = new DatasetLineageGraph()
    g.insert(SOURCE_A)
    g.insert({
      datasetId: d('ds-c'),
      parentDatasetIds: [d('ds-a')],
      lineageHash: HASH('ccc'),
      recordedAt: '2024-01-02T00:00:00.000Z' as import('../../src/index.js').DatasetIsoTimestamp,
    })
    expect(g.findRoots(d('ds-c'))).toEqual([d('ds-a')])
  })

  it('multi-parent derived traces to all roots', () => {
    const g = new DatasetLineageGraph()
    g.insert(SOURCE_A)
    g.insert(SOURCE_B)
    g.insert(DERIVED_C)
    const roots = g.findRoots(d('ds-c')).sort()
    expect(roots).toEqual([d('ds-a'), d('ds-b')])
  })
})

// ── DatasetLineageGraph: multi-level traversal ────────────────────────────────

describe('DatasetLineageGraph: multi-level traversal', () => {
  function buildGraph(): DatasetLineageGraph {
    const g = new DatasetLineageGraph()
    g.insert(SOURCE_A)
    g.insert(SOURCE_B)
    g.insert(DERIVED_C)
    g.insert(DERIVED_D)
    return g
  }

  it('findAncestors returns all ancestors in topological order', () => {
    const g = buildGraph()
    const ancestors = g.findAncestors(d('ds-d'))
    expect(ancestors).toContain(d('ds-c'))
    expect(ancestors).toContain(d('ds-a'))
    expect(ancestors).toContain(d('ds-b'))
    expect(ancestors.indexOf(d('ds-c'))).toBeLessThan(ancestors.indexOf(d('ds-a')))
  })

  it('findDescendants of source A includes C and D', () => {
    const g = buildGraph()
    const desc = g.findDescendants(d('ds-a'))
    expect(desc).toContain(d('ds-c'))
    expect(desc).toContain(d('ds-d'))
  })

  it('findAffectedDescendants of A includes all derived', () => {
    const g = buildGraph()
    const affected = g.findAffectedDescendants(d('ds-a'))
    expect(affected).toContain(d('ds-c'))
    expect(affected).toContain(d('ds-d'))
  })
})

// ── Cycle detection ───────────────────────────────────────────────────────────

describe('DatasetLineageGraph: cycle detection', () => {
  it('direct cycle A→B, B→A rejected on insert', () => {
    const g = new DatasetLineageGraph()
    g.insert(SOURCE_A)
    g.insert({
      datasetId: d('ds-b'),
      parentDatasetIds: [d('ds-a')],
      lineageHash: HASH('bbb'),
      recordedAt: '2024-01-02T00:00:00.000Z' as import('../../src/index.js').DatasetIsoTimestamp,
    })
    // attempt to make A a child of B (creates cycle)
    expect(() => g.insert({
      datasetId: d('ds-a'),
      parentDatasetIds: [d('ds-b')],
      lineageHash: HASH('aaa2'),
      recordedAt: '2024-01-03T00:00:00.000Z' as import('../../src/index.js').DatasetIsoTimestamp,
    })).toThrow(/cycle/)
  })

  it('indirect cycle A→B→C→A rejected on insert', () => {
    const g = new DatasetLineageGraph()
    g.insert(SOURCE_A)
    g.insert({ datasetId: d('ds-b'), parentDatasetIds: [d('ds-a')], lineageHash: HASH('b'), recordedAt: '2024-01-02T00:00:00.000Z' as import('../../src/index.js').DatasetIsoTimestamp })
    g.insert({ datasetId: d('ds-c'), parentDatasetIds: [d('ds-b')], lineageHash: HASH('c'), recordedAt: '2024-01-03T00:00:00.000Z' as import('../../src/index.js').DatasetIsoTimestamp })
    expect(() => g.insert({ datasetId: d('ds-a'), parentDatasetIds: [d('ds-c')], lineageHash: HASH('a2'), recordedAt: '2024-01-04T00:00:00.000Z' as import('../../src/index.js').DatasetIsoTimestamp })).toThrow(/cycle/)
  })
})

// ── Replay idempotency and conflict ───────────────────────────────────────────

describe('DatasetLineageGraph: replay and conflict', () => {
  it('inserting identical node twice is idempotent', () => {
    const g = new DatasetLineageGraph()
    const r1 = g.insert(SOURCE_A)
    const r2 = g.insert(SOURCE_A)
    expect(r1.inserted).toBe(true)
    expect(r2.inserted).toBe(false)
    expect(r2.idempotent).toBe(true)
  })

  it('inserting same datasetId with different hash is conflict', () => {
    const g = new DatasetLineageGraph()
    g.insert(SOURCE_A)
    const conflicting: LineageNode = { ...SOURCE_A, lineageHash: HASH('different') }
    const r = g.insert(conflicting)
    expect(r.inserted).toBe(false)
    expect(r.conflict).toBe(true)
  })
})

// ── Deterministic traversal ───────────────────────────────────────────────────

describe('DatasetLineageGraph: deterministic traversal', () => {
  it('findAncestors returns same order on repeated calls', () => {
    const g = new DatasetLineageGraph()
    g.insert(SOURCE_A)
    g.insert(SOURCE_B)
    g.insert(DERIVED_C)
    g.insert(DERIVED_D)
    const first = g.findAncestors(d('ds-d'))
    const second = g.findAncestors(d('ds-d'))
    expect(first).toEqual(second)
  })
})

// ── Lineage integrity hash ────────────────────────────────────────────────────

describe('lineage integrity hash', () => {
  it('computeLineageHash returns a content hash string', async () => {
    const { computeLineageHash } = await import('../../src/index.js')
    const h = computeLineageHash(SOURCE_A)
    expect(h).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('different nodes produce different hashes', async () => {
    const { computeLineageHash } = await import('../../src/index.js')
    const h1 = computeLineageHash(SOURCE_A)
    const h2 = computeLineageHash(SOURCE_B)
    expect(h1).not.toBe(h2)
  })

  it('mutation-sensitive: changing parentDatasetIds changes hash', async () => {
    const { computeLineageHash } = await import('../../src/index.js')
    const before = computeLineageHash(DERIVED_C)
    const mutated: LineageNode = { ...DERIVED_C, parentDatasetIds: [d('ds-a')] }
    const after = computeLineageHash(mutated)
    expect(before).not.toBe(after)
  })
})
