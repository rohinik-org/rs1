export interface MemoryPolicyConfig {
  readonly episodicEnabled: boolean
  readonly semanticEnabled: boolean
  readonly proceduralEnabled: boolean
  readonly minConfidenceForSemantic: number
  readonly minConfidenceForProcedural: number
  readonly defaultTtlDays?: number
  readonly maxEpisodesPerWorkflow?: number
  readonly sensitiveConceptPatterns: readonly string[]
}

export const DEFAULT_MEMORY_POLICY: MemoryPolicyConfig = {
  episodicEnabled: true,
  semanticEnabled: false,
  proceduralEnabled: false,
  minConfidenceForSemantic: 0.7,
  minConfidenceForProcedural: 0.8,
  sensitiveConceptPatterns: [],
}
