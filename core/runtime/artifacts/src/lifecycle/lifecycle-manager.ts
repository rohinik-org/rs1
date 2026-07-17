import type { CapabilityCatalog, InstallManager, CapabilityAdapter, AdapterConfig, ExecutionBinding } from '@rohinik-org/adapter-sdk'
import type { RegistrationRecord } from '@rohinik-org/compiler'

export interface UpgradeResult {
  readonly oldVersion: string
  readonly newVersion: string
  readonly record: RegistrationRecord
}

export class LifecycleManager {
  constructor(
    private readonly catalog: CapabilityCatalog,
    private readonly installManager: InstallManager,
  ) {}

  async upgrade(
    adapter: CapabilityAdapter,
    config: AdapterConfig,
    bindings: Map<string, ExecutionBinding>,
  ): Promise<UpgradeResult> {
    const snapshot = await this.catalog.read()
    const existing = snapshot.entries.find(e => e.id === adapter.id)
    const oldVersion = existing?.version ?? 'not-installed'
    if (existing) {
      await this.catalog.remove(adapter.id)
    }
    const record = await this.installManager.install(adapter, config, bindings)
    return { oldVersion, newVersion: adapter.version, record }
  }

  async rollback(id: string): Promise<void> {
    const snapshot = await this.catalog.read()
    const previous = snapshot.entries
      .filter(e => e.id === id && e.status === 'disabled')
      .sort((a, b) => (b.updatedAt ?? b.installedAt).localeCompare(a.updatedAt ?? a.installedAt))[0]
    if (!previous) throw new Error(`No previous version of '${id}' found to roll back to.`)
    await this.catalog.setStatus(id, 'disabled')
    await this.catalog.setStatus(previous.id, 'enabled')
  }

  async uninstall(id: string): Promise<void> {
    const snapshot = await this.catalog.read()
    if (!snapshot.entries.some(e => e.id === id)) throw new Error(`Package '${id}' is not installed.`)
    await this.catalog.remove(id)
  }
}
