import type {
  PackageTrustPolicy,
  DegradedTrustResult,
  DegradingFinding,
  BlockingFinding,
  ManualReviewFinding,
} from './types.js'

export class DegradedTrustEvaluator {
  evaluate(
    policy: PackageTrustPolicy,
    degradingFindings: readonly DegradingFinding[],
    blockingFindings: readonly BlockingFinding[],
    manualReviewFindings: readonly ManualReviewFinding[],
  ): DegradedTrustResult {
    // Hard blocker prevents degraded trust
    if (blockingFindings.length > 0) {
      return {
        permitted: false,
        degradations: [],
        restrictions: [],
        reason: 'hard-blocker-prevents-degraded-trust',
      }
    }

    // Unresolved manual review prevents degraded trust
    if (manualReviewFindings.length > 0) {
      return {
        permitted: false,
        degradations: [],
        restrictions: [],
        reason: 'manual-review-prevents-degraded-trust',
      }
    }

    // No degradations = no degraded trust to evaluate
    if (degradingFindings.length === 0) {
      return {
        permitted: false,
        degradations: [],
        restrictions: [],
        reason: 'no-degradations-present',
      }
    }

    // Policy must explicitly allow degraded trust
    if (!policy.allowDegradedTrust) {
      return {
        permitted: false,
        degradations: [],
        restrictions: [],
        reason: 'degraded-trust-not-permitted-by-policy',
      }
    }

    // Collect restrictions from degraded rules
    const restrictions: string[] = []
    for (const rule of policy.degradedRules) {
      if (rule.detail) restrictions.push(rule.detail)
    }

    return {
      permitted: true,
      degradations: degradingFindings,
      restrictions: [...restrictions].sort(),
    }
  }
}
