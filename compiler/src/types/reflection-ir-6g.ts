export type FindingCategory =
  | 'FAILURE' | 'PERFORMANCE' | 'COST'
  | 'RELIABILITY' | 'PLANNING' | 'PROVIDER' | 'CAPABILITY'

export type RootCauseCategory =
  | 'INVALID_INPUT' | 'MISSING_CAPABILITY' | 'PROVIDER_FAILURE'
  | 'TIMEOUT' | 'BAD_PLAN' | 'POLICY' | 'NETWORK' | 'UNKNOWN'

export type RecommendationKind =
  | 'REPLAN' | 'ACQUIRE_CAPABILITY' | 'CHANGE_PROVIDER'
  | 'UPDATE_POLICY' | 'RETRY' | 'NO_ACTION'

export interface ReflectionFinding {
  readonly findingId: string
  readonly category: FindingCategory
  readonly confidence: number          // 0–1
  readonly evidence: readonly string[] // executionId, stepId, or journal entry ref
  readonly summary: string
}

export interface RootCause {
  readonly causeId: string
  readonly category: RootCauseCategory
  readonly confidence: number          // 0–1
  readonly evidence: readonly string[]
}

export interface ReflectionRecommendation {
  readonly recommendationId: string
  readonly kind: RecommendationKind
  readonly confidence: number          // 0–1
  readonly explanation: string
  readonly findingRefs: readonly string[] // invariant: every recommendation traces to ≥1 finding
}

export interface ReflectionCandidate {
  readonly kind: 'ReflectionCandidate'
  readonly schemaVersion: '1.0'
  readonly candidateId: string
  readonly executionId: string
  readonly generatedAt: string
  readonly findings: readonly ReflectionFinding[]
  readonly rootCause: RootCause
  readonly recommendations: readonly ReflectionRecommendation[]
}

export interface ReflectionReport {
  readonly kind: 'ReflectionReport'
  readonly schemaVersion: '1.0'
  readonly reportId: string
  readonly executionId: string
  readonly createdAt: string
  readonly rootCause: RootCause
  readonly findings: readonly ReflectionFinding[]
  readonly recommendations: readonly ReflectionRecommendation[]
  readonly status: 'APPROVED' | 'DEFERRED' | 'REJECTED'
}

export interface ReflectionPolicy {
  readonly minimumConfidence: number
  readonly emitLearningTriggers: boolean
  readonly emitMemoryArtifacts: boolean
  readonly emitObservations: boolean
}

export const DEFAULT_REFLECTION_POLICY: ReflectionPolicy = {
  minimumConfidence: 0.5,
  emitLearningTriggers: true,
  emitMemoryArtifacts: true,
  emitObservations: false,
}

export interface ReflectionQuery {
  readonly executionId?: string
  readonly category?: FindingCategory
  readonly rootCauseCategory?: RootCauseCategory
  readonly recommendationKind?: RecommendationKind
  readonly minConfidence?: number
  readonly limit?: number
}
