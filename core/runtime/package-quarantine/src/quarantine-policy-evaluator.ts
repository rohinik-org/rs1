import type { PackageQuarantineRequest, PackageQuarantinePolicy, QuarantinePolicyRequirement } from './types.js'

export function evaluateQuarantinePolicy(
  request: PackageQuarantineRequest,
  policy: PackageQuarantinePolicy,
): QuarantinePolicyRequirement {
  const { trustDecision } = request

  // Denied → required
  if (trustDecision === 'denied' && policy.quarantineDenied) return 'required'

  // Manual review → required
  if (trustDecision === 'manual-review-required' && policy.quarantineManualReview) return 'required'

  // Conditionally trusted → required-with-restrictions
  if (trustDecision === 'conditionally-trusted' && policy.quarantineConditionallyTrusted) return 'required-with-restrictions'

  // Already quarantined (passed through from upstream) → required
  if (trustDecision === 'quarantined') return 'required'

  // Trusted: check emergency rules
  if (trustDecision === 'trusted') {
    if (!policy.emergencyRules || policy.emergencyRules.length === 0) return 'not-required'
    const pkg = request.subject.packageId
    const matching = policy.emergencyRules.filter(r => pkg.includes(r.packagePattern) || r.packagePattern === '*')
    const requireQuarantine = matching.filter(r => r.quarantine)
    const noQuarantine = matching.filter(r => !r.quarantine)
    if (requireQuarantine.length > 0 && noQuarantine.length > 0) return 'policy-conflict'
    if (requireQuarantine.length > 0) return 'required'
    return 'not-required'
  }

  return 'not-required'
}
