export type EvidenceArtifactType =
  | 'MEMORY' | 'OBSERVATION' | 'REFLECTION' | 'EXECUTION'
  | 'GRAPH' | 'CAPABILITY' | 'NETWORK'

export interface EvidenceReference {
  readonly artifactType: EvidenceArtifactType
  readonly artifactId: string
  readonly confidence: number        // 0–1
}

export interface NormalizedEvidence {
  readonly evidenceId: string
  readonly artifactType: EvidenceArtifactType
  readonly artifactId: string
  readonly timestamp: string
  readonly signals: Readonly<Record<string, number>>
  readonly confidence: number
}

export interface EvidenceSet {
  readonly setId: string
  readonly collectedAt: string
  readonly items: readonly NormalizedEvidence[]
}

export type HypothesisCategory =
  | 'PROVIDER_DEGRADATION' | 'CAPABILITY_FAILURE' | 'NETWORK_ISSUE'
  | 'PLANNING_DEFICIENCY' | 'POLICY_CONFLICT' | 'MEMORY_GAP' | 'UNKNOWN'

export interface Hypothesis {
  readonly hypothesisId: string
  readonly statement: string
  readonly category: HypothesisCategory
  readonly confidence: number
  readonly supportingEvidence: readonly EvidenceReference[]
  readonly contradictingEvidence: readonly EvidenceReference[]
}

export interface InferenceChain {
  readonly chainId: string
  readonly ruleId: string
  readonly inputEvidence: readonly EvidenceReference[]
  readonly intermediateConclusions: readonly string[]
  readonly outputHypothesisId: string
}

export type ReasoningAction =
  | 'ACQUIRE_CAPABILITY' | 'UPDATE_PROVIDER' | 'RETRY'
  | 'REPLAN' | 'RETRAIN' | 'DISABLE_PROVIDER' | 'USER_APPROVAL'

export type ReasoningPriority = 'LOW' | 'MEDIUM' | 'HIGH'

export interface ReasoningRecommendation {
  readonly recommendationId: string
  readonly hypothesisId: string
  readonly priority: ReasoningPriority
  readonly action: ReasoningAction
  readonly reason: string
}

export interface ReasoningReport {
  readonly kind: 'ReasoningReport'
  readonly schemaVersion: '1.0'
  readonly reportId: string
  readonly generatedAt: string
  readonly hypothesisSet: readonly Hypothesis[]
  readonly selectedHypothesis: string
  readonly recommendationSet: readonly ReasoningRecommendation[]
  readonly evidenceGraph: readonly EvidenceReference[]
  readonly inferenceChains: readonly InferenceChain[]
  readonly status: 'APPROVED' | 'DEFERRED' | 'REJECTED'
}

export interface ReasoningPolicy {
  readonly minimumConfidence: number
  readonly maximumHypotheses: number
  readonly minimumEvidenceCount: number
  readonly allowContradictoryOutput: boolean
}

export const DEFAULT_REASONING_POLICY: ReasoningPolicy = {
  minimumConfidence: 0.4,
  maximumHypotheses: 10,
  minimumEvidenceCount: 1,
  allowContradictoryOutput: true,
}

export interface ReasoningQuery {
  readonly category?: HypothesisCategory
  readonly action?: ReasoningAction
  readonly minConfidence?: number
  readonly limit?: number
}
