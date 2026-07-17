import type { Hypothesis, ReasoningPolicy } from '@rohinik-org/compiler'

export class ReasoningPolicyEngine {
  evaluate(hypotheses: readonly Hypothesis[], policy: ReasoningPolicy): 'APPROVED' | 'DEFERRED' | 'REJECTED' {
    if (hypotheses.length === 0) return 'REJECTED'
    const anyMeetsThreshold = hypotheses.some(h => h.confidence >= policy.minimumConfidence)
    if (!anyMeetsThreshold) return 'DEFERRED'
    return 'APPROVED'
  }
}
