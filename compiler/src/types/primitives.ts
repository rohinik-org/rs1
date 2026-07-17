export type ArtifactId = string
export type SessionId = string
export type SnapshotId = string
export type IntentId = ArtifactId
export type PlanId = ArtifactId
export type ExecutionId = ArtifactId
export type SemanticCapability = string

export interface Requirement {
  readonly type: 'requires' | 'excludes' | 'prefers' | 'cost' | 'security'
  readonly target: string
  readonly value?: unknown
}
