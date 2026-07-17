import type { TierId } from './skill-interface.js'

export type CapabilityCategory =
  | 'data'
  | 'developer'
  | 'reasoning'
  | 'tool'
  | 'memory'
  | 'utility'

export type CostTier = 'free' | 'low' | 'medium' | 'high'
export type LatencyTier = 'very-low' | 'low' | 'medium' | 'high'

export interface SdkSkillMetadata {
  readonly skillId: string
  readonly name: string
  readonly version: string
  readonly description: string
  readonly tags: readonly string[]
  readonly costTier: CostTier
  readonly latencyTier: LatencyTier
  readonly examples?: readonly string[]
}

// Execution metadata belongs to the capability — it declares which tier
// executes the capability's skills. Every skill inside the capability must
// agree with this tierId (enforced at registration by runtime-registry).
//
// Grouped as an object rather than a flat field so future additions
// (resourceCost, priority) live in the same conceptual namespace.
export interface CapabilityExecutionMetadata {
  readonly tierId: TierId
  // Reserved: readonly resourceCost?, readonly priority?
}

export interface SdkCapabilityMetadata {
  readonly capabilityId: string
  readonly name: string
  readonly version: string
  readonly contractVersion: string
  readonly description: string
  readonly category: CapabilityCategory
  readonly tags: readonly string[]
  readonly author?: string
  // Optional in v1 for backward compat. When absent, runtime-registry
  // derives from the first skill's tierId and emits a deprecation
  // diagnostic. Next release will require this field.
  readonly execution?: CapabilityExecutionMetadata
}
