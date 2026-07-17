import type { ArtifactBase } from './artifact.js'
import type { SnapshotId, SemanticCapability, Requirement } from './primitives.js'

export interface PlannerMetadata {
  readonly preferredInputTypes?: readonly string[]
  readonly preferredOutputTypes?: readonly string[]
  readonly estimatedLatencyMs?: number
  readonly estimatedCostUsd?: number
  readonly parallelizable?: boolean
  readonly sideEffects?: readonly string[]
  readonly idempotent?: boolean
}

export interface SkillDescriptor {
  readonly skillId: string
  readonly capabilityId: string
  readonly tierId: string
  readonly version: string
  readonly semantics: readonly SemanticCapability[]
  readonly requirements: readonly Requirement[]
  readonly plannerMetadata?: PlannerMetadata
  readonly description?: string
}

export interface CapabilitySnapshot extends ArtifactBase {
  readonly snapshotId: SnapshotId
  readonly capturedAt: string
  readonly runtimeId: string
  readonly source: string
  readonly fingerprint: string
  readonly skills: readonly SkillDescriptor[]
}
