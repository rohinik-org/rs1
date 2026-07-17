import type { Capability } from '../interfaces/capability.js'
import type { TierId } from '../interfaces/tier.js'
import type { MutableCapabilityCatalog } from '../interfaces/catalog.js'
import type { Skill } from '../interfaces/skill.js'

export class InMemoryCapabilityCatalog implements MutableCapabilityCatalog {
  private capabilities = new Map<string, Capability>()

  register(capability: Capability): void {
    this.capabilities.set(capability.metadata.capabilityId, capability)
  }

  getForTier(tierId: TierId): Capability[] {
    return [...this.capabilities.values()].filter(c => c.metadata.tierId === tierId)
  }

  isHealthy(_capabilityId: string): boolean {
    // Phase 1: always healthy — health tracking is advisory only
    return true
  }

  getAll(): Capability[] {
    return [...this.capabilities.values()]
  }

  getAllSkills(): Skill[] {
    return [...this.capabilities.values()].flatMap(c => [...c.skills])
  }
}
