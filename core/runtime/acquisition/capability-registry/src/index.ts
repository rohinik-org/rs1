import type { CapabilityManifestIR } from '@rohinik-org/capability-manifest'

export type InstalledCapabilityState =
  | 'DISCOVERED'
  | 'DOWNLOADED'
  | 'VERIFIED'
  | 'INSTALLED'
  | 'REGISTERED'
  | 'FAILED'
  | 'REMOVED'

export interface CapabilitySourceRef {
  readonly type: string
  readonly id: string
  readonly uri?: string
}

export interface InstalledCapability {
  readonly capabilityId: string
  readonly version: string
  readonly manifest: CapabilityManifestIR
  readonly installedAt: Date
  readonly source: CapabilitySourceRef
  readonly acquisitionId: string
  readonly dependencies: ReadonlyArray<string>
  readonly state: InstalledCapabilityState
}

export class CapabilityRegistry {
  private readonly _capabilities = new Map<string, InstalledCapability>()

  register(capability: InstalledCapability): void {
    this._capabilities.set(capability.capabilityId, capability)
  }

  unregister(capabilityId: string): void {
    this._capabilities.delete(capabilityId)
  }

  get(capabilityId: string): InstalledCapability | undefined {
    return this._capabilities.get(capabilityId)
  }

  list(): ReadonlyArray<InstalledCapability> {
    return Array.from(this._capabilities.values())
  }

  isInstalled(capabilityId: string): boolean {
    const c = this._capabilities.get(capabilityId)
    return c !== undefined && c.state === 'REGISTERED'
  }

  getDependents(capabilityId: string): ReadonlyArray<InstalledCapability> {
    return this.list().filter(c => c.dependencies.includes(capabilityId))
  }

  updateState(capabilityId: string, state: InstalledCapabilityState): void {
    const existing = this._capabilities.get(capabilityId)
    if (existing) this._capabilities.set(capabilityId, { ...existing, state })
  }
}

export class CapabilityReferenceCounter {
  // ponytail: Map<capabilityId, Set<requiredBy>>
  private readonly _refs = new Map<string, Set<string>>()

  addRef(capabilityId: string, requiredBy: string): void {
    if (!this._refs.has(capabilityId)) this._refs.set(capabilityId, new Set())
    this._refs.get(capabilityId)!.add(requiredBy)
  }

  removeRef(capabilityId: string, requiredBy: string): void {
    this._refs.get(capabilityId)?.delete(requiredBy)
  }

  refCount(capabilityId: string): number {
    return this._refs.get(capabilityId)?.size ?? 0
  }

  canUninstall(capabilityId: string): boolean {
    return this.refCount(capabilityId) === 0
  }

  getDependents(capabilityId: string): ReadonlyArray<string> {
    return Array.from(this._refs.get(capabilityId) ?? [])
  }
}

export interface CapabilityLock {
  acquire(capabilityId: string): Promise<void>
  release(capabilityId: string): void
  isLocked(capabilityId: string): boolean
}

export class InMemoryCapabilityLock implements CapabilityLock {
  // ponytail: per-capability mutex via Promise chain; no external dep needed
  private readonly _locks = new Map<string, Promise<void>>()
  private readonly _resolvers = new Map<string, () => void>()

  async acquire(capabilityId: string): Promise<void> {
    while (this._locks.has(capabilityId)) {
      await this._locks.get(capabilityId)
    }
    let resolve!: () => void
    const p = new Promise<void>(r => { resolve = r })
    this._locks.set(capabilityId, p)
    this._resolvers.set(capabilityId, resolve)
  }

  release(capabilityId: string): void {
    const resolve = this._resolvers.get(capabilityId)
    this._locks.delete(capabilityId)
    this._resolvers.delete(capabilityId)
    resolve?.()
  }

  isLocked(capabilityId: string): boolean {
    return this._locks.has(capabilityId)
  }
}
