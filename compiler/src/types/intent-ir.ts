import type { ArtifactBase, ArtifactReference } from './artifact.js'

export interface IntentGoal {
  readonly action: string
  readonly object?: string
  readonly desiredState?: string
}

export interface IntentEntity {
  readonly name: string
  readonly type: 'path' | 'file' | 'directory' | 'data' | 'value' | 'reference'
  readonly resolved: unknown
  readonly source: 'binding' | 'literal' | 'session' | 'artifact'
  readonly bindingRef?: string
  readonly artifactRef?: ArtifactReference
}

export interface IntentConstraint {
  readonly type: 'preserve' | 'exclude' | 'require' | 'prefer' | 'limit'
  readonly target: string
  readonly value?: unknown
}

export interface IntentIR extends ArtifactBase {
  readonly goal: IntentGoal
  readonly entities: readonly IntentEntity[]
  readonly constraints: readonly IntentConstraint[]
  readonly confidence: number
}
