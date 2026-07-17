export type MemoryArtifactKind = 'EPISODE' | 'SEMANTIC_FACT' | 'PROCEDURE'

export interface MemoryArtifact {
  readonly kind: 'MemoryArtifact'
  readonly artifactId: string
  readonly artifactKind: MemoryArtifactKind
  readonly candidateId: string
  readonly content: Readonly<Record<string, unknown>>
  readonly importanceScore: number
  readonly consolidatedAt: string
  readonly expiresAt?: string
}
