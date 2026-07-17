import type { ArtifactBase } from './artifact.js'
import type { SnapshotId, SemanticCapability, Requirement } from './primitives.js'

export interface StepInput {
  readonly name: string
  readonly source: 'intent_entity' | 'prior_step' | 'binding'
  readonly ref: string
}

export interface StepOutputSpec {
  readonly type: string
  readonly bindAs?: string
}

export interface ResourceEstimate {
  readonly estimatedTokens?: number
  readonly estimatedCostUsd?: number
  readonly estimatedLatencyMs?: number
  readonly estimatedMemoryMb?: number
  readonly estimatedGpuMs?: number
}

export interface PlanStep {
  readonly stepId: string
  readonly ordinal: number
  readonly description: string
  readonly action: string
  readonly requiredSemantics: readonly SemanticCapability[]
  readonly requirements: readonly Requirement[]
  readonly inputs: readonly StepInput[]
  readonly expectedOutput: StepOutputSpec
  readonly dependsOn: readonly string[]
  readonly fallbackStepIds?: readonly string[]
}

export interface PlanIR extends ArtifactBase {
  readonly capabilitySnapshotId: SnapshotId
  readonly steps: readonly PlanStep[]
  readonly resourceEstimate?: ResourceEstimate
}
