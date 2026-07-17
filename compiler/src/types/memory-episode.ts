export interface MemoryEpisode {
  readonly kind: 'MemoryEpisode'
  readonly episodeId: string
  readonly executionId: string
  readonly planId: string
  readonly workflowId?: string
  readonly rawInput: string
  readonly concepts: readonly string[]
  readonly skillsUsed: readonly string[]
  readonly outcome: 'SUCCESS' | 'FAILED' | 'CANCELLED'
  readonly durationMs: number
  readonly estimatedCostUsd: number
  readonly retryCount: number
  readonly providersUsed: readonly string[]
  readonly recordedAt: string
  readonly expiresAt?: string
  readonly importanceScore: number
}
