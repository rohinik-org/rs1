import type {
  PackageQuarantineState,
  PackageProvisioningAuthorizationPolicy,
  PackageProvisioningAuthorizationOutcome,
  AuthorizationReason,
} from './types.js'

export interface QuarantineGateResult {
  readonly pass: boolean
  readonly outcome: PackageProvisioningAuthorizationOutcome
  readonly reasons: readonly AuthorizationReason[]
}

export function evaluateQuarantineGate(
  state: PackageQuarantineState,
  policy: PackageProvisioningAuthorizationPolicy,
): QuarantineGateResult {
  switch (state) {
    case 'not-quarantined':
      return { pass: true, outcome: 'authorized', reasons: [] }

    case 'quarantined':
      return {
        pass: false, outcome: 'denied',
        reasons: [{ code: 'quarantined', detail: 'Package artifact is actively quarantined' }],
      }

    case 'quarantined-degraded':
      return {
        pass: false, outcome: 'denied',
        reasons: [{ code: 'quarantine-degraded', detail: 'Package artifact is in degraded quarantine' }],
      }

    case 'containment-pending':
      return {
        pass: false, outcome: 'deferred',
        reasons: [{ code: 'containment-pending', detail: 'Quarantine containment is pending' }],
      }

    case 'release-pending':
      return {
        pass: false, outcome: 'deferred',
        reasons: [{ code: 'release-pending', detail: 'Quarantine release is pending' }],
      }

    case 'verification-failed':
      return {
        pass: false, outcome: 'denied',
        reasons: [{ code: 'quarantine-verification-failed', detail: 'Quarantine verification failed' }],
      }

    case 'manual-intervention-required':
      return {
        pass: false, outcome: 'manual-review-required',
        reasons: [{ code: 'quarantine-manual-intervention', detail: 'Quarantine requires manual intervention' }],
      }

    case 'unknown':
    default:
      if (policy.denyWhenQuarantineStateUnknown) {
        return {
          pass: false, outcome: 'denied',
          reasons: [{ code: 'quarantine-state-unknown', detail: 'Quarantine state is unknown; policy requires denial' }],
        }
      }
      return {
        pass: false, outcome: 'deferred',
        reasons: [{ code: 'quarantine-state-unknown', detail: 'Quarantine state is unknown; deferring' }],
      }
  }
}
