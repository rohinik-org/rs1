import type { DriverProvider, DriverProviderEntry } from '@rohinik-org/capability-manifest'
import { RUNTIME_API_VERSION, RUNTIME_MANIFEST_VERSION } from '@rohinik-org/capability-manifest'
import type { DriverRegistry } from '../kernel/driver-registry.js'
import type { CapabilityDriverRegistry } from '../kernel/capability-driver-registry.js'

const PROVIDER_TYPE_ORDER: Record<string, number> = {
  enterprise: 0,
  plugin: 1,
  builtin: 2,
  remote: 3,
}

// ponytail: transactional — collect → validate → register all-or-nothing
export class DriverBootstrap {
  constructor(private readonly providers: ReadonlyArray<DriverProvider>) {}

  async load(
    driverReg: DriverRegistry,
    capabilityReg: CapabilityDriverRegistry
  ): Promise<void> {
    // Phase 1: collect + sort
    const entries: Array<{ entry: DriverProviderEntry; providerType: string }> = []
    for (const provider of this.providers) {
      const loaded = await provider.load()
      for (const entry of loaded) {
        entries.push({ entry, providerType: provider.type })
      }
    }

    // Sort: enterprise→plugin→builtin→remote; within type: priority DESC, id ASC
    entries.sort((a, b) => {
      const typeOrder = (PROVIDER_TYPE_ORDER[a.providerType] ?? 99) - (PROVIDER_TYPE_ORDER[b.providerType] ?? 99)
      if (typeOrder !== 0) return typeOrder
      const pa = a.entry.binding.descriptor.priority
      const pb = b.entry.binding.descriptor.priority
      if (pb !== pa) return pb - pa
      return a.entry.binding.descriptor.id.localeCompare(b.entry.binding.descriptor.id)
    })

    // Phase 2: validate (all checks before any registration)
    const seenDriverIds = new Set<string>()
    const seenCapabilityIds = new Set<string>()

    for (const { entry } of entries) {
      const did = entry.binding.descriptor.id
      if (seenDriverIds.has(did)) throw new Error(`Duplicate driver ID: ${did}`)
      seenDriverIds.add(did)

      const av = entry.binding.descriptor.apiVersion
      if (av !== RUNTIME_API_VERSION) {
        throw new Error(`Driver "${did}" apiVersion mismatch: expected ${RUNTIME_API_VERSION}, got ${av}`)
      }

      for (const capId of entry.capabilityIds) {
        if (seenCapabilityIds.has(capId)) throw new Error(`Duplicate capability ID: ${capId}`)
        seenCapabilityIds.add(capId)
        // validate driverRef resolves
        // (driverRef is the driver's own id for builtin; validate it matches)
        if (!entry.capabilityIds.every(Boolean)) throw new Error(`Empty capability ID in driver ${did}`)
      }
    }

    // Phase 3: register all-or-nothing
    for (const { entry } of entries) {
      driverReg.register(entry.binding)
      for (const capId of entry.capabilityIds) {
        capabilityReg.registerDriverRef(capId, entry.binding.descriptor.id)
      }
    }
  }
}
