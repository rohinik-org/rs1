import type { ReflectionCandidate, ReflectionPolicy } from '@rohinik-org/compiler'

export class ReflectionPolicyEngine {
  evaluate(candidate: ReflectionCandidate, policy: ReflectionPolicy): 'APPROVED' | 'DEFERRED' | 'REJECTED' {
    if (candidate.findings.length === 0) return 'REJECTED'

    const maxConfidence = Math.max(...candidate.findings.map(f => f.confidence))
    if (maxConfidence < policy.minimumConfidence) return 'DEFERRED'

    return 'APPROVED'
  }
}
