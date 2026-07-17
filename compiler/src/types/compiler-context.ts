import type { SessionId, SnapshotId } from './primitives.js'
import type { ArtifactReference } from './artifact.js'
import type { CapabilitySnapshot } from './capability-snapshot.js'

export type BindingTable = Readonly<Record<string, unknown>>

export interface FeatureMap {
  readonly memory: boolean
  readonly streaming: boolean
  readonly reasoning: boolean
}

export interface RuntimeInfo {
  readonly runtimeId: string
  readonly protocolVersion: string
  readonly features: FeatureMap
}

export interface SystemSnapshot {
  readonly snapshotId: SnapshotId
  readonly capturedAt: string
  readonly runtime: RuntimeInfo
  readonly capabilities: CapabilitySnapshot
}

export interface SessionContext {
  readonly sessionId: SessionId
  readonly bindings: BindingTable
  readonly activeArtifacts: readonly ArtifactReference[]
}

export interface CompilationPolicy {
  readonly clarificationThreshold: number
  readonly maxPlanSteps: number
  readonly allowedTiers: readonly string[]
  readonly verificationMode: 'strict' | 'warn' | 'skip'
  readonly budget?: { maxTokens?: number; maxCostUsd?: number; maxLatencyMs?: number }
}

export interface CompilerContext {
  readonly session: SessionContext
  readonly policy: CompilationPolicy
  readonly system: SystemSnapshot
}
