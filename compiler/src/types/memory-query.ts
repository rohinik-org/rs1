import type { MemoryArtifactKind, MemoryArtifact } from './memory-artifact.js'

export interface MemoryQuery {
  readonly concepts?: readonly string[]
  readonly workflowId?: string
  readonly outcomeFilter?: 'SUCCESS' | 'FAILED' | 'ANY'
  readonly limit?: number
  readonly minImportance?: number
  readonly kinds?: readonly MemoryArtifactKind[]
}

export interface MemoryResult {
  readonly artifact: MemoryArtifact
  readonly relevanceScore: number
  readonly explanation: string
}
