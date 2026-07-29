import type {
  CanonicalPermission,
  AuthorizedPermission,
  DeniedPermission,
  PermissionEnforcementCapability,
  PermissionAssessment,
  PermissionEnforcementAssessment,
} from '@rohinik-org/package-trust-ir'
import type { PrivilegeExpansionFinding, LeastPrivilegeFinding } from './types.js'
import type { PolicyEvaluationResult } from './permission-policy-evaluator.js'

export function buildPermissionAssessment(
  manifestSemanticHash: string,
  declaredPermissions: readonly CanonicalPermission[],
  policyResult: PolicyEvaluationResult,
  expansionFindings: readonly PrivilegeExpansionFinding[],
  _leastPrivilegeFindings: readonly LeastPrivilegeFinding[],
  enforcementCapabilities: readonly PermissionEnforcementCapability[],
): PermissionAssessment {
  // Expansion findings demote affected permissions to denied
  const expansionDenied: DeniedPermission[] = expansionFindings.map(f => ({
    permission: f.permission,
    reason: `expansion:${f.kind}`,
  }))

  const expansionDeniedKeys = new Set(
    expansionFindings.map(f => `${f.permission.domain}\0${f.permission.value}\0${f.permission.resourceConstraint ?? ''}`),
  )

  const filteredGranted: AuthorizedPermission[] = policyResult.granted.filter(
    g =>
      !expansionDeniedKeys.has(
        `${g.permission.domain}\0${g.permission.value}\0${g.permission.resourceConstraint ?? ''}`,
      ),
  )

  const allDenied: DeniedPermission[] = [...policyResult.denied, ...expansionDenied]

  // Enforcement assessment
  const grantedDomains = new Set(filteredGranted.map(g => g.permission.domain))
  const enforcedMap = new Map(enforcementCapabilities.map(c => [c.domain, c.enforced]))
  const unenforceablePermissions: string[] = []
  for (const domain of grantedDomains) {
    if (enforcedMap.has(domain) && !enforcedMap.get(domain)) {
      unenforceablePermissions.push(domain)
    }
  }
  const enforceable = unenforceablePermissions.length === 0

  const enforcementAssessment: PermissionEnforcementAssessment = {
    enforceable,
    capabilities: enforcementCapabilities,
    unenforceablePermissions,
  }

  // Decision
  let decision: 'granted' | 'conditionally-granted' | 'denied'
  if (expansionFindings.length > 0 || allDenied.length > 0 || policyResult.hasConflict) {
    decision = 'denied'
  } else if (filteredGranted.some(g => g.conditionId !== undefined)) {
    decision = 'conditionally-granted'
  } else {
    decision = 'granted'
  }

  return {
    manifestSemanticHash,
    declaredPermissions,
    grantedPermissions: filteredGranted,
    deniedPermissions: allDenied,
    enforcementAssessment,
    decision,
  }
}
