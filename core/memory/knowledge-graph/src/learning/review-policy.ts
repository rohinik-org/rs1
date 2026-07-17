import type { InferenceSet } from '@rohinik-org/compiler'

// Stage 5A default: approve all candidates whose confidence >= threshold.
// Confidence is read-only — the policy filters but never adjusts scores.
export class AutoApprovalPolicy {
  readonly policyId = 'AutoApprovalPolicy'
  constructor(private readonly threshold: number = 0.7) {}

  async review(inferenceSet: InferenceSet) {
    const approved: string[] = []
    const rejected: string[] = []
    for (const c of inferenceSet.candidates) {
      if (c.confidence >= this.threshold) approved.push(c.stableEdgeId)
      else rejected.push(c.stableEdgeId)
    }
    return { approved, rejected, thresholdUsed: this.threshold }
  }
}
