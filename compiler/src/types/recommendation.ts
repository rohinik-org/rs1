import type { CapabilityGraphRelationship, EdgeCertainty } from './capability-graph.js'

export type RecommendationType =
  | 'RELATED_CAPABILITY'
  | 'COMPANION_TOOL'
  | 'ALTERNATIVE'
  | 'WORKFLOW_STEP'        // reserved — Stage 5D

export interface ExplanationStep {
  readonly fromNodeId: string
  readonly relationship: CapabilityGraphRelationship
  readonly toNodeId: string
  readonly certainty: EdgeCertainty
  readonly direction: 'OUTGOING' | 'INCOMING'
}

export interface ExplanationPath {
  readonly steps: readonly ExplanationStep[]
  readonly evidence: {
    readonly graphTraversal: boolean
    readonly graphEdgeCount: number
    readonly corpus?: {
      readonly executionCount: number
      readonly coOccurrenceCount: number
    }
  }
}

export interface RecommendationConfidence {
  readonly score: number           // 0–1 normalised final score
  readonly graphWeight: number     // epistemic contribution from graph traversal
  readonly corpusWeight: number    // epistemic contribution from corpus frequency
  readonly policyWeight: number    // ranking adjustment only — not epistemic
}

export interface Recommendation {
  readonly nodeId: string
  readonly recommendationType: RecommendationType
  readonly confidence: RecommendationConfidence
  readonly explanation: ExplanationPath
  readonly producedBy: readonly string[]  // strategyIds
}
