import { randomUUID, createHash } from 'node:crypto'
import type { InferenceSet, InferencePromotion, CapabilityGraphEdge } from '@rohinik-org/compiler'
import type { AutoApprovalPolicy } from './review-policy.js'

export class PromotionPipeline {
  constructor(private readonly policy: AutoApprovalPolicy) {}

  // Pure function given the same InferenceSet + graphRevisionBefore.
  // Stable edge IDs are derived from stableEdgeId hash — not random UUIDs.
  async promote(
    inferenceSet: InferenceSet,
    graphRevisionBefore: number,
    graphRevisionAfter: number,
  ): Promise<InferencePromotion> {
    const { approved, rejected, thresholdUsed } = await this.policy.review(inferenceSet)
    const approvedSet = new Set(approved)
    const now = new Date().toISOString()

    const promotedEdges: CapabilityGraphEdge[] = inferenceSet.candidates
      .filter(c => approvedSet.has(c.stableEdgeId))
      .map(c => ({
        // Stable edgeId: deterministic SHA-256 of the stableEdgeId string
        edgeId: createHash('sha256').update(c.stableEdgeId).digest('hex'),
        source: c.source,
        target: c.target,
        relationship: c.relationship,
        certainty: 'INFERRED' as const,
        confidence: c.confidence,          // never modified — promotion only filters
        required: false,
        provenance: 'execution-corpus' as const,
        provenanceDetail: `Inferred by ${c.inferenceRuleId} from ${c.evidence.executions} executions`,
        originInferenceId: inferenceSet.inferenceSetId,
        originRule: c.inferenceRuleId,
        evidenceSampleSize: c.evidence.executions,
        evidenceCount: c.evidence.successes,
        addedAt: now,
      }))

    return {
      kind: 'InferencePromotion',
      schemaVersion: '1.0',
      promotionId: randomUUID(),
      inferenceSetId: inferenceSet.inferenceSetId,
      reviewedAt: now,
      reviewPolicyId: this.policy.policyId,
      thresholdUsed,
      promotedEdges,
      rejectedCandidates: rejected,
      graphRevisionBefore,
      graphRevisionAfter,
    }
  }
}
