import type { ArtifactId, SessionId, SnapshotId } from './primitives.js'

export interface ArtifactMetadata {
  readonly artifactId: ArtifactId
  readonly schemaVersion: string
  readonly kind: string
  readonly createdAt: string
  readonly producer: string
}

export interface ArtifactProvenance {
  readonly systemSnapshotId: SnapshotId
  readonly parentArtifacts: readonly ParentRef[]
  readonly sessionId: SessionId
}

export interface ParentRef {
  readonly artifactId: ArtifactId
  readonly kind: string
}

export interface ArtifactIntegrity {
  readonly checksum: string
}

export interface ArtifactLifecycle {
  readonly state: 'DRAFT' | 'ACTIVE' | 'SUPERSEDED' | 'ARCHIVED'
  readonly supersedes?: ArtifactId
}

export interface ArtifactReference {
  readonly artifactId: ArtifactId
  readonly kind: string
  readonly schemaVersion: string
}

// Shared base for all Rohinik artifacts — identity, integrity, lifecycle.
export interface BaseArtifact {
  readonly meta: ArtifactMetadata
  readonly integrity: ArtifactIntegrity
  readonly lifecycle: ArtifactLifecycle
}

// Runtime artifacts — record production provenance ("where did I come from?").
// IntentIR, PlanIR, ExecutionGraph, VerificationReport, ExecutionReport, etc.
export interface RuntimeArtifactBase extends BaseArtifact {
  readonly provenance: ArtifactProvenance
}

// Backward-compatible alias: existing code that uses ArtifactBase continues to work.
export type ArtifactBase = RuntimeArtifactBase
