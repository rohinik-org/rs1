import type { Recommendation } from './recommendation.js'

export interface RecommendationResult {
  readonly kind: 'RecommendationResult'
  readonly schemaVersion: '1.0'
  readonly recommendationId: string    // SHA-256 of canonical body excluding generatedAt
  readonly generatedAt: string         // ISO-8601
  readonly anchors: readonly string[]  // nodeIds used as seeds
  readonly generatedBy: string         // RecommendationPolicy.policyId (versioned)
  readonly graphRevision: number       // CapabilityGraph.revision at generation time
  readonly corpusRevision: number      // ExecutionCorpus record count at generation time
  readonly recommendations: readonly Recommendation[]
}
