import type { Capability } from './capability.js'
import type { TierId } from './tier.js'
import type { Skill } from './skill.js'

export interface CapabilityCatalog {
  getForTier(tierId: TierId): Capability[]
  isHealthy(capabilityId: string): boolean
  getAll(): Capability[]
}

export interface MutableCapabilityCatalog extends CapabilityCatalog {
  register(capability: Capability): void
  getAllSkills(): Skill[]
}
