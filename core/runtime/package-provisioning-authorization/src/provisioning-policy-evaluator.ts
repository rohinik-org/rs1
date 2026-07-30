import type {
  PackageProvisioningAuthorizationRequest,
  PackageProvisioningTrustSnapshot,
  PackageProvisioningAuthorizationPolicy,
  PackageProvisioningAuthorizationOutcome,
  AuthorizationReason,
  ProvisioningAuthorizationCondition,
  RequestedCapability,
  RequestedPermission,
  CapabilityScopeEvaluation,
} from './types.js'

export interface PolicyEvaluationResult {
  readonly outcome: PackageProvisioningAuthorizationOutcome
  readonly reasons: readonly AuthorizationReason[]
  readonly conditions: readonly ProvisioningAuthorizationCondition[]
  readonly authorizedCapabilities: readonly RequestedCapability[]
  readonly authorizedPermissions: readonly RequestedPermission[]
  readonly expiresAt?: string
}

export function evaluateProvisioningPolicy(
  req: PackageProvisioningAuthorizationRequest,
  snapshot: PackageProvisioningTrustSnapshot,
  policy: PackageProvisioningAuthorizationPolicy,
  capScope: CapabilityScopeEvaluation,
  permScope: { allowed: readonly RequestedPermission[]; denied: readonly RequestedPermission[]; reasons: readonly AuthorizationReason[] },
  trustUsabilityOutcome: PackageProvisioningAuthorizationOutcome,
  trustConditions: readonly ProvisioningAuthorizationCondition[],
  trustReasons: readonly AuthorizationReason[],
  requestedAt: string,
): PolicyEvaluationResult {

  // Authorization precedence (spec §12)
  if (trustUsabilityOutcome === 'denied') {
    return { outcome: 'denied', reasons: trustReasons, conditions: [], authorizedCapabilities: [], authorizedPermissions: [] }
  }
  if (trustUsabilityOutcome === 'manual-review-required') {
    return { outcome: 'manual-review-required', reasons: trustReasons, conditions: [], authorizedCapabilities: [], authorizedPermissions: [] }
  }

  // Mode checks
  if (req.provisioningMode === 'downgrade' && !policy.allowDowngrade) {
    return {
      outcome: 'denied',
      reasons: [{ code: 'downgrade-not-allowed', detail: 'Policy does not permit downgrade provisioning mode' }],
      conditions: [], authorizedCapabilities: [], authorizedPermissions: [],
    }
  }
  if (req.provisioningMode === 'manual-recovery' && !policy.allowManualRecovery) {
    return {
      outcome: 'denied',
      reasons: [{ code: 'manual-recovery-not-allowed', detail: 'Policy does not permit manual-recovery provisioning mode' }],
      conditions: [], authorizedCapabilities: [], authorizedPermissions: [],
    }
  }

  // Capability scope check
  if (capScope.denied.length > 0) {
    return {
      outcome: 'denied',
      reasons: [...capScope.reasons],
      conditions: [], authorizedCapabilities: [], authorizedPermissions: [],
    }
  }

  // Permission scope check
  if (permScope.denied.length > 0) {
    return {
      outcome: 'denied',
      reasons: [...permScope.reasons],
      conditions: [], authorizedCapabilities: [], authorizedPermissions: [],
    }
  }

  // Compute expiry
  let expiresAt: string | undefined
  if (policy.authorizationTtlSeconds > 0) {
    const issuedMs = new Date(requestedAt).getTime()
    expiresAt = new Date(issuedMs + policy.authorizationTtlSeconds * 1000).toISOString()
  }

  // Outcome-driving conditions: trust + capability restrictions determine authorized-with-conditions
  const outcomeConditions: ProvisioningAuthorizationCondition[] = [
    ...trustConditions,
    ...capScope.restricted.map(r => ({ kind: r.conditionKind, detail: `Capability '${r.capabilityId}' restricted` })),
  ]

  // Informational conditions: appended to final conditions array but do not downgrade outcome
  const infoConditions: ProvisioningAuthorizationCondition[] = []
  if (policy.singleUseAuthorization) {
    infoConditions.push({ kind: 'single-use', detail: 'Authorization is single-use' })
  }
  if (expiresAt !== undefined) {
    infoConditions.push({ kind: 'expires-at', detail: expiresAt })
  }

  const allConditions = [...outcomeConditions, ...infoConditions]
  const allReasons = [...trustReasons, ...capScope.reasons, ...permScope.reasons]

  if (outcomeConditions.length > 0 || trustUsabilityOutcome === 'authorized-with-conditions') {
    return {
      outcome: 'authorized-with-conditions',
      reasons: allReasons,
      conditions: allConditions,
      authorizedCapabilities: capScope.allowed,
      authorizedPermissions: permScope.allowed,
      ...(expiresAt !== undefined && { expiresAt }),
    }
  }

  return {
    outcome: 'authorized',
    reasons: allReasons,
    conditions: allConditions,
    authorizedCapabilities: capScope.allowed,
    authorizedPermissions: permScope.allowed,
    ...(expiresAt !== undefined && { expiresAt }),
  }
}
