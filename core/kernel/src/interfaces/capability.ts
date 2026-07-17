import type { TierId } from './tier.js'
import type { Skill } from './skill.js'

export interface CapabilityMetadata {
  readonly capabilityId: string
  readonly name: string
  readonly tierId: TierId
  readonly version: string
  readonly contractVersion: string
  readonly description?: string
  readonly tags?: readonly string[]
  readonly author?: string
}

export type CapabilityHealthStatus = 'HEALTHY' | 'DEGRADED' | 'UNAVAILABLE'

export interface CapabilityHealth {
  readonly capabilityId: string
  readonly status: CapabilityHealthStatus
  readonly successRate: number
  readonly averageLatencyMs: number
  readonly lastFailure?: Date
  readonly consecutiveFailures: number
  readonly enabled: boolean
}

export interface Capability {
  readonly metadata: CapabilityMetadata
  readonly skills: readonly Skill[]
}
