import type {
  PackageProvisioningTrustSnapshot,
  PackageProvisioningAuthorizationPolicy,
  PackageProvisioningAuthorizationOutcome,
  AuthorizationReason,
  ProvisioningAuthorizationCondition,
} from './types.js'

export interface TrustUsabilityResult {
  readonly usable: boolean
  readonly outcome: PackageProvisioningAuthorizationOutcome
  readonly reasons: readonly AuthorizationReason[]
  readonly conditions: readonly ProvisioningAuthorizationCondition[]
}

export function evaluateTrustUsability(
  snapshot: PackageProvisioningTrustSnapshot,
  policy: PackageProvisioningAuthorizationPolicy,
): TrustUsabilityResult {
  const { trustDecision } = snapshot

  if (trustDecision === 'denied') {
    return {
      usable: false,
      outcome: 'denied',
      reasons: [{ code: 'trust-denied', detail: 'Trust decision is denied' }],
      conditions: [],
    }
  }

  if (trustDecision === 'manual-review-required') {
    return {
      usable: false,
      outcome: 'manual-review-required',
      reasons: [{ code: 'trust-manual-review', detail: 'Trust decision requires manual review' }],
      conditions: [],
    }
  }

  if (!policy.allowedTrustOutcomes.includes(trustDecision)) {
    return {
      usable: false,
      outcome: 'denied',
      reasons: [{ code: 'trust-outcome-not-allowed', detail: `Trust outcome '${trustDecision}' not permitted by policy` }],
      conditions: [],
    }
  }

  if (trustDecision === 'conditionally-trusted') {
    if (!policy.allowConditionalTrust) {
      return {
        usable: false,
        outcome: 'denied',
        reasons: [{ code: 'conditional-trust-not-allowed', detail: 'Policy does not permit conditional trust' }],
        conditions: [],
      }
    }
    return {
      usable: true,
      outcome: 'authorized-with-conditions',
      reasons: [{ code: 'conditional-trust', detail: 'Package is conditionally trusted; conditions apply' }],
      conditions: [{ kind: 'sandbox-required', detail: 'Conditionally trusted package must run in sandbox' }],
    }
  }

  // trusted
  return {
    usable: true,
    outcome: 'authorized',
    reasons: [{ code: 'trust-approved', detail: 'Trust decision is trusted and usable' }],
    conditions: [],
  }
}
