import { describe, it, expect, vi } from 'vitest'
import { CatalogSnapshotManager } from '../snapshot-manager.js'
import type { CapabilityCatalog, LanguagePackageCatalog, ModelArtifactCatalog, CatalogSnapshot, CatalogId, CatalogSnapshotHash } from '@rohinik-org/resolution-graph-ir'

function makeSnapshot(id: string): CatalogSnapshot {
  return {
    catalogId: id as CatalogId,
    snapshotHash: `hash-${id}` as CatalogSnapshotHash,
    capturedAt: '2026-07-27T00:00:00.000Z' as any,
  }
}

function mockCatalog(id: string): CapabilityCatalog {
  return {
    catalogId: id as CatalogId,
    sourceKind: 'organization',
    getSnapshot: async () => makeSnapshot(id),
    findProviders: async () => [],
    findPackageVersions: async () => [],
    getPackageDescriptor: async () => undefined,
  }
}

function mockLanguageCatalog(id: string): LanguagePackageCatalog {
  return {
    catalogId: id as CatalogId,
    ecosystem: 'npm',
    getSnapshot: async () => makeSnapshot(id),
    findVersions: async () => [],
  }
}

function mockModelCatalog(id: string): ModelArtifactCatalog {
  return {
    catalogId: id as CatalogId,
    registryId: 'registry-1',
    getSnapshot: async () => makeSnapshot(id),
    findVersions: async () => [],
  }
}

describe('CatalogSnapshotManager', () => {
  it('acquires snapshot from mock catalog', async () => {
    const mgr = new CatalogSnapshotManager([mockCatalog('cat-1')], [], [])
    await mgr.acquireSnapshots()
    const snap = mgr.getCapabilitySnapshot('cat-1' as CatalogId)
    expect(snap.catalogId).toBe('cat-1')
    expect(snap.snapshotHash).toBe('hash-cat-1')
  })

  it('returns same snapshot instance on repeated access', async () => {
    const mgr = new CatalogSnapshotManager([mockCatalog('cat-1')], [], [])
    await mgr.acquireSnapshots()
    const a = mgr.getCapabilitySnapshot('cat-1' as CatalogId)
    const b = mgr.getCapabilitySnapshot('cat-1' as CatalogId)
    expect(a).toBe(b)
  })

  it('throws on unknown catalogId', async () => {
    const mgr = new CatalogSnapshotManager([mockCatalog('cat-1')], [], [])
    await mgr.acquireSnapshots()
    expect(() => mgr.getCapabilitySnapshot('unknown' as CatalogId)).toThrow()
  })

  it('acquires snapshots from multiple catalogs in parallel', async () => {
    const getSnapshotSpy1 = vi.fn(async () => makeSnapshot('cat-a'))
    const getSnapshotSpy2 = vi.fn(async () => makeSnapshot('cat-b'))
    const cat1 = { ...mockCatalog('cat-a'), getSnapshot: getSnapshotSpy1 }
    const cat2 = { ...mockCatalog('cat-b'), getSnapshot: getSnapshotSpy2 }
    const mgr = new CatalogSnapshotManager([cat1, cat2], [], [])
    await mgr.acquireSnapshots()
    expect(getSnapshotSpy1).toHaveBeenCalledOnce()
    expect(getSnapshotSpy2).toHaveBeenCalledOnce()
    expect(mgr.getCapabilitySnapshot('cat-a' as CatalogId).catalogId).toBe('cat-a')
    expect(mgr.getCapabilitySnapshot('cat-b' as CatalogId).catalogId).toBe('cat-b')
  })

  it('getAllCapabilitySnapshots returns all acquired snapshots', async () => {
    const mgr = new CatalogSnapshotManager([mockCatalog('c1'), mockCatalog('c2')], [], [])
    await mgr.acquireSnapshots()
    const all = mgr.getAllCapabilitySnapshots()
    expect(all).toHaveLength(2)
  })

  it('acquires language catalog snapshot', async () => {
    const mgr = new CatalogSnapshotManager([], [mockLanguageCatalog('lang-1')], [])
    await mgr.acquireSnapshots()
    const snap = mgr.getLanguageSnapshot('lang-1' as CatalogId)
    expect(snap.catalogId).toBe('lang-1')
  })

  it('acquires model catalog snapshot', async () => {
    const mgr = new CatalogSnapshotManager([], [], [mockModelCatalog('model-1')])
    await mgr.acquireSnapshots()
    const snap = mgr.getModelSnapshot('model-1' as CatalogId)
    expect(snap.catalogId).toBe('model-1')
  })
})
