export type LearningTriggerKind =
  | 'VOLUME_THRESHOLD'       // N executions for skill — enough to analyze
  | 'LATENCY_REGRESSION'     // P95 latency degraded by X% over baseline
  | 'FAILURE_SPIKE'          // failure rate exceeded threshold
  | 'COST_ANOMALY'           // cost per execution deviated significantly
  | 'PROVIDER_DRIFT'         // provider resolution pattern changed
  | 'ROUTING_ANOMALY'        // unexpected tier selection pattern
  | 'DEPRECATION_SIGNAL'     // package / provider deprecation detected

export type ConfidenceMethod =
  | 'STANDARD_DEVIATION'
  | 'BAYESIAN'
  | 'EWMA'                   // exponentially weighted moving average
  | 'MOVING_AVERAGE'
  | 'WELFORD'                // Welford's online algorithm
  | 'DIRECT_OBSERVATION'     // single direct measurement (no statistical model)

export interface TriggerEvidence {
  readonly metric: string
  readonly observedValue: number
  readonly baselineValue?: number
  readonly deviationPercent?: number
  readonly confidence: number       // 0–1
  readonly confidenceMethod: ConfidenceMethod
  readonly sampleSize: number
}

// Observation artifact — not a recommendation.
// States that the corpus contains statistically significant signal worth analyzing.
export interface LearningTrigger {
  readonly kind: 'LearningTrigger'
  readonly schemaVersion: '1.0'
  readonly triggerId: string        // UUID
  readonly detectedAt: string       // ISO-8601
  readonly triggerKind: LearningTriggerKind
  readonly affectedSkillId?: string
  readonly affectedProviderId?: string
  readonly affectedTierId?: string
  readonly evidence: TriggerEvidence
  readonly suggestedCommand: string // e.g. 'rhk learn weather.fetch'
  readonly corpusWindowStart: string
  readonly corpusWindowEnd: string
  readonly recordCount: number
}

// Reserved — Stage 5. Namespace held here; no implementation.
export interface LearningReport { readonly kind: 'LearningReport'; readonly schemaVersion: '1.0' }
export interface AdaptationProposal { readonly kind: 'AdaptationProposal'; readonly schemaVersion: '1.0' }
export interface AppliedAdaptation { readonly kind: 'AppliedAdaptation'; readonly schemaVersion: '1.0' }
