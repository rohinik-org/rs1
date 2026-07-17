export type MemoryCandidateKind = 'EPISODIC' | 'SEMANTIC' | 'PROCEDURAL'

export interface MemoryCandidate {
  readonly candidateId: string
  readonly kind: MemoryCandidateKind
  readonly sourceExecutionId: string
  readonly evidence: Readonly<Record<string, unknown>>
  readonly confidence: number
  readonly producedAt: string
}

export interface MemoryCandidateSet {
  readonly kind: 'MemoryCandidateSet'
  readonly setId: string
  readonly executionId: string
  readonly candidates: readonly MemoryCandidate[]
  readonly producedAt: string
}
