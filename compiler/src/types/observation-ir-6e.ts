export type ObservationCategory =
  | 'PACKAGE' | 'PROVIDER' | 'DOCUMENTATION' | 'SECURITY'
  | 'GRAPH' | 'MEMORY' | 'CORPUS' | 'SYSTEM'
  | 'WORKFLOW' | 'CAPABILITY'

export type ObservationStatus = 'ACTIVE' | 'EXPIRED' | 'SUPERSEDED'

export interface ObservationEvidence {
  readonly evidenceId: string
  readonly kind: 'HTTP' | 'GITHUB' | 'REGISTRY' | 'PROVIDER_METRICS' | 'MEMORY' | 'CORPUS' | 'GRAPH'
  readonly capturedAt: string
  readonly confidence: number
}

export interface ProviderMetricsEvidence extends ObservationEvidence {
  readonly kind: 'PROVIDER_METRICS'
  readonly latencyMs: number
  readonly errorRate: number
  readonly successRate: number
  readonly sampleSize: number
}

export interface RegistryEvidence extends ObservationEvidence {
  readonly kind: 'REGISTRY'
  readonly packageName: string
  readonly version: string
  readonly deprecated: boolean
  readonly publishedAt: string
}

export interface HttpEvidence extends ObservationEvidence {
  readonly kind: 'HTTP'
  readonly url: string
  readonly statusCode: number
  readonly contentType: string
  readonly contentLength: number
}

export interface Observation {
  readonly observationId: string
  readonly sourceId: string
  readonly observedAt: string
  readonly category: ObservationCategory
  readonly confidence: number
  readonly ttlSeconds?: number
  readonly evidence: readonly ObservationEvidence[]
  readonly tags: readonly string[]
  readonly summary: string
}

export interface ObservationState {
  readonly observationId: string
  readonly status: ObservationStatus
  readonly updatedAt: string
}

export interface ObservationQuery {
  readonly categories: readonly ObservationCategory[]
  readonly terms: readonly string[]
  readonly since?: string
}
