export type ExecutionOutcome = 'SUCCESS' | 'FAILED' | 'NO_ROUTE' | 'TIMEOUT'

export interface ExecutionCandidate {
  readonly skillId: string
  readonly tierId: string
  readonly score: number
  readonly selected: boolean
}

export interface TierLatency {
  readonly tierId: string
  readonly latencyMs: number
  readonly evaluated: boolean
  readonly rejected: boolean
}

export interface ProviderResolutionRecord {
  readonly requirementKey: string
  readonly providerId: string
  readonly providerKind: string
  readonly resolved: boolean
  readonly latencyMs?: number
}

// Canonical persistent artifact written after every completed execution.
// The unit stored in the ExecutionCorpus.
// requestHash replaces raw content — no PII stored in corpus (Law 21).
export interface ExecutionRecord {
  readonly kind: 'ExecutionRecord'
  readonly schemaVersion: '1.0'
  readonly recordId: string              // SHA-256 of canonical body
  readonly runtimeId: string
  readonly timestamp: string             // ISO-8601

  // Request identity — content-addressed, never raw content
  readonly requestId: string
  readonly requestHash: string           // SHA-256 of request content
  readonly contentType: string
  readonly requestSizeBytes: number

  // Routing outcome
  readonly outcome: ExecutionOutcome
  readonly winnerTierId?: string
  readonly winnerSkillId?: string
  readonly allCandidates: readonly ExecutionCandidate[]
  readonly reasoningInvoked: boolean
  readonly retried: boolean
  readonly retryCount: number

  // Timing
  readonly totalLatencyMs: number
  readonly tierLatencies: readonly TierLatency[]

  // Cost (estimated)
  readonly estimatedCostUsd?: number
  readonly tokensUsed?: number

  // Provider evidence
  readonly providerResolutions: readonly ProviderResolutionRecord[]

  // Provenance
  readonly sourceTraceId: string         // DecisionTrace.requestId
  readonly runtimeVersion: string
}
