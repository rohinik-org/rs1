import type {
  CapabilityCatalog,
  LanguagePackageCatalog,
  ModelArtifactCatalog,
  CatalogSnapshot,
  CatalogId,
} from '@rohinik-org/resolution-graph-ir'

export class CatalogSnapshotManager {
  #acquired = false
  private readonly capabilitySnapshots = new Map<string, CatalogSnapshot>()
  private readonly languageSnapshots = new Map<string, CatalogSnapshot>()
  private readonly modelSnapshots = new Map<string, CatalogSnapshot>()

  constructor(
    private readonly capabilityCatalogs: readonly CapabilityCatalog[],
    private readonly languageCatalogs: readonly LanguagePackageCatalog[],
    private readonly modelCatalogs: readonly ModelArtifactCatalog[],
  ) {}

  async acquireSnapshots(): Promise<void> {
    if (this.#acquired) return
    await Promise.all([
      ...this.capabilityCatalogs.map(async (cat) => {
        const snap = await cat.getSnapshot()
        this.capabilitySnapshots.set(snap.catalogId, snap)
      }),
      ...this.languageCatalogs.map(async (cat) => {
        const snap = await cat.getSnapshot()
        this.languageSnapshots.set(snap.catalogId, snap)
      }),
      ...this.modelCatalogs.map(async (cat) => {
        const snap = await cat.getSnapshot()
        this.modelSnapshots.set(snap.catalogId, snap)
      }),
    ])
    this.#acquired = true
  }

  getCapabilitySnapshot(catalogId: CatalogId): CatalogSnapshot {
    const snap = this.capabilitySnapshots.get(catalogId)
    if (!snap) throw new Error(`No capability catalog snapshot for catalogId: ${catalogId}`)
    return snap
  }

  getLanguageSnapshot(catalogId: CatalogId): CatalogSnapshot {
    const snap = this.languageSnapshots.get(catalogId)
    if (!snap) throw new Error(`No language catalog snapshot for catalogId: ${catalogId}`)
    return snap
  }

  getModelSnapshot(catalogId: CatalogId): CatalogSnapshot {
    const snap = this.modelSnapshots.get(catalogId)
    if (!snap) throw new Error(`No model catalog snapshot for catalogId: ${catalogId}`)
    return snap
  }

  getAllCapabilitySnapshots(): readonly CatalogSnapshot[] {
    return [...this.capabilitySnapshots.values()]
  }

  getAllLanguageSnapshots(): readonly CatalogSnapshot[] {
    return [...this.languageSnapshots.values()]
  }

  getAllModelSnapshots(): readonly CatalogSnapshot[] {
    return [...this.modelSnapshots.values()]
  }
}
