import type { CapabilityGraphEdge } from './capability-graph.js'

// Artifact produced by the Promotion Pipeline after a ReviewPolicy decision.
// Records exactly which candidates were accepted and which were rejected, the policy
// threshold used, and the graph revisions before and after.
// Immutable once written — never edited, only superseded by a new InferencePromotion.
export interface InferencePromotion {
  readonly kind: 'InferencePromotion'
  readonly schemaVersion: '1.0'
  readonly promotionId: string                     // UUID
  readonly inferenceSetId: string                  // the InferenceSet this reviews
  readonly reviewedAt: string                      // ISO-8601
  readonly reviewPolicyId: string                  // e.g. 'AutoApprovalPolicy'
  readonly thresholdUsed: number                   // e.g. 0.7
  readonly promotedEdges: readonly CapabilityGraphEdge[]
  readonly rejectedCandidates: readonly string[]   // stableEdgeId of each rejected candidate
  readonly graphRevisionBefore: number
  readonly graphRevisionAfter: number
}
