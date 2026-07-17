import type { ArtifactBase } from './artifact.js'
import type { SemanticCapability, Requirement } from './primitives.js'

export type ExecutionOperation = 'SIMULATE' | 'EXECUTE' | 'GET_DECISION' | 'LIST_CAPABILITIES'

export interface ExecutionCommand {
  readonly operation: ExecutionOperation
  readonly arguments: Readonly<Record<string, unknown>>
  readonly expectedCapability?: SemanticCapability
  readonly expectedTier?: string
  readonly constraints?: readonly Requirement[]
}

export interface RetryPolicy {
  readonly maxRetries: number
  readonly backoffMs: number
  readonly retryOn: readonly string[]
}

export interface ExecutionNode {
  readonly nodeId: string
  readonly planStepId: string
  readonly command: ExecutionCommand
  readonly retryPolicy?: RetryPolicy
}

export type ExecutionEdgeType = 'sequential' | 'data_dependency' | 'conditional'

export interface ExecutionEdge {
  readonly fromNodeId: string
  readonly toNodeId: string
  readonly type: ExecutionEdgeType
}

export interface ExecutionGraph extends ArtifactBase {
  readonly nodes: readonly ExecutionNode[]
  readonly edges: readonly ExecutionEdge[]
}
