import type { ArtifactStorage } from '../../ports/artifact-storage.js'
import type { ArtifactStorageStat, ArtifactIdentityReceipt, StorageReceipt } from '../../types.js'

interface ArtifactEntry {
  sizeBytes?: number
  activatable: boolean
  sealed: boolean
  packageId?: string
  version?: string
  digest?: string
}

export class InMemoryArtifactStorage implements ArtifactStorage {
  private readonly store = new Map<string, ArtifactEntry>()

  constructor(initial: Record<string, { sizeBytes?: number; activatable?: boolean; packageId?: string; version?: string; digest?: string }> = {}) {
    for (const [ref, entry] of Object.entries(initial)) {
      const stored: ArtifactEntry = {
        activatable: entry.activatable ?? true,
        sealed: false,
      }
      if (entry.sizeBytes !== undefined) stored.sizeBytes = entry.sizeBytes
      if (entry.packageId !== undefined) stored.packageId = entry.packageId
      if (entry.version !== undefined) stored.version = entry.version
      if (entry.digest !== undefined) stored.digest = entry.digest
      this.store.set(ref, stored)
    }
  }

  async stat(reference: string): Promise<ArtifactStorageStat> {
    const entry = this.store.get(reference)
    if (!entry) return { exists: false }
    const result: ArtifactStorageStat = { exists: true, activatable: entry.activatable, sealed: entry.sealed }
    if (entry.sizeBytes !== undefined) return { ...result, sizeBytes: entry.sizeBytes }
    return result
  }

  async seal(reference: string): Promise<StorageReceipt> {
    const entry = this.store.get(reference)
    if (!entry) throw new Error(`Artifact not found: ${reference}`)
    entry.sealed = true
    const r: StorageReceipt = { operation: 'seal', reference, completedAt: 'sealed' }
    if (entry.sizeBytes !== undefined) return { ...r, sizeBytes: entry.sizeBytes }
    return r
  }

  async copy(source: string, destination: string): Promise<StorageReceipt> {
    const entry = this.store.get(source)
    if (!entry) throw new Error(`Artifact not found: ${source}`)
    this.store.set(destination, { ...entry })
    const r: StorageReceipt = { operation: 'copy', reference: destination, completedAt: 'copied' }
    if (entry.sizeBytes !== undefined) return { ...r, sizeBytes: entry.sizeBytes }
    return r
  }

  async move(source: string, destination: string): Promise<StorageReceipt> {
    const entry = this.store.get(source)
    if (!entry) throw new Error(`Artifact not found: ${source}`)
    this.store.set(destination, { ...entry })
    this.store.delete(source)
    const r: StorageReceipt = { operation: 'move', reference: destination, completedAt: 'moved' }
    if (entry.sizeBytes !== undefined) return { ...r, sizeBytes: entry.sizeBytes }
    return r
  }

  async removeActivationReference(reference: string): Promise<StorageReceipt> {
    const entry = this.store.get(reference)
    if (!entry) throw new Error(`Artifact not found: ${reference}`)
    entry.activatable = false
    return { operation: 'remove-activation-reference', reference, completedAt: 'deactivated' }
  }

  async verifyIdentity(reference: string): Promise<ArtifactIdentityReceipt> {
    const entry = this.store.get(reference)
    if (!entry) throw new Error(`Artifact not found: ${reference}`)
    const r: ArtifactIdentityReceipt = {
      reference,
      packageId: entry.packageId ?? 'unknown',
      activatable: entry.activatable,
    }
    if (entry.version !== undefined) return { ...r, version: entry.version, ...(entry.digest !== undefined ? { digest: entry.digest } : {}) }
    if (entry.digest !== undefined) return { ...r, digest: entry.digest }
    return r
  }

  /** test helper */
  getEntry(reference: string): ArtifactEntry | undefined {
    return this.store.get(reference)
  }
}
