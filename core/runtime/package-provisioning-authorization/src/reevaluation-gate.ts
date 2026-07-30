import type {
  PackageTrustReevaluationState,
  PackageProvisioningAuthorizationPolicy,
  PackageProvisioningAuthorizationOutcome,
  AuthorizationReason,
} from './types.js'

export interface ReevaluationGateResult {
  readonly pass: boolean
  readonly outcome: PackageProvisioningAuthorizationOutcome
  readonly reasons: readonly AuthorizationReason[]
}

export function evaluateReevaluationGate(
  state: PackageTrustReevaluationState,
  policy: PackageProvisioningAuthorizationPolicy,
): ReevaluationGateResult {
  switch (state) {
    case 'not-required':
    case 'completed-current':
      return { pass: true, outcome: 'authorized', reasons: [] }

    case 'pending':
    case 'retry-required':
      return {
        pass: false, outcome: 'deferred',
        reasons: [{ code: `reevaluation-${state}`, detail: `Trust reevaluation is ${state}` }],
      }

    case 'required':
      return {
        pass: false, outcome: 'deferred',
        reasons: [{ code: 'reevaluation-required', detail: 'Reevaluation is required before provisioning' }],
      }

    case 'failed':
      if (policy.requireCurrentReevaluation) {
        return {
          pass: false, outcome: 'denied',
          reasons: [{ code: 'reevaluation-failed', detail: 'Trust reevaluation failed; policy requires denial' }],
        }
      }
      return {
        pass: false, outcome: 'manual-review-required',
        reasons: [{ code: 'reevaluation-failed', detail: 'Trust reevaluation failed; manual review required' }],
      }

    case 'superseded':
      return {
        pass: false, outcome: 'superseded',
        reasons: [{ code: 'reevaluation-superseded', detail: 'Trust record has been superseded' }],
      }

    default:
      return {
        pass: false, outcome: 'deferred',
        reasons: [{ code: 'reevaluation-unknown', detail: 'Reevaluation state is unknown' }],
      }
  }
}
