import type { CanonicalPermission, DeniedPermission, PermissionAssessment } from '@rohinik-org/package-trust-ir'
import type { PermissionEvaluationRequest } from './types.js'
import { validatePermissionEvaluationRequest } from './permission-request-validator.js'
import { parsePermissionDeclarations } from './permission-declaration-parser.js'
import { canonicalizePermissions } from './permission-canonicalizer.js'
import { evaluatePermissionScope } from './permission-scope-evaluator.js'
import { detectPrivilegeExpansion } from './privilege-expansion-detector.js'
import { evaluateLeastPrivilege } from './least-privilege-evaluator.js'
import { evaluatePermissionPolicy } from './permission-policy-evaluator.js'
import { buildPermissionAssessment } from './assessment-builder.js'

function deniedAssessment(
  manifestSemanticHash: string,
  permissions: readonly CanonicalPermission[],
  reason: string,
): PermissionAssessment {
  const denied: DeniedPermission[] = permissions.map(p => ({ permission: p, reason }))
  return {
    manifestSemanticHash,
    declaredPermissions: permissions,
    grantedPermissions: [],
    deniedPermissions: denied,
    enforcementAssessment: { enforceable: false, capabilities: [], unenforceablePermissions: [] },
    decision: 'denied',
  }
}

export class PermissionEvaluator {
  evaluate(request: PermissionEvaluationRequest): PermissionAssessment {
    // 1. Validate request
    const validation = validatePermissionEvaluationRequest(request)
    if (!validation.valid) {
      return deniedAssessment(
        request?.permissionManifest?.semanticHash ?? '',
        request?.permissionManifest?.requestedPermissions ?? [],
        'invalid-request',
      )
    }

    const { permissionManifest, executionContext, policy } = request

    // 2. Parse declarations
    const parseResult = parsePermissionDeclarations(permissionManifest.requestedPermissions)
    if (!parseResult.ok) {
      return deniedAssessment(permissionManifest.semanticHash, [], parseResult.reason)
    }

    // 3. Canonicalize
    const canonical = canonicalizePermissions(parseResult.value.parsed)

    // 4. Scope evaluation — collect violations into denied list
    const scopeDenied: DeniedPermission[] = []
    const scopeValid: CanonicalPermission[] = []
    for (const perm of canonical) {
      const result = evaluatePermissionScope(perm, policy, executionContext)
      if (result.valid) {
        scopeValid.push(perm)
      } else {
        scopeDenied.push({ permission: perm, reason: `scope:${result.reason ?? 'invalid'}` })
      }
    }

    // 5. Privilege expansion (on scope-valid permissions only)
    const expansionFindings = detectPrivilegeExpansion(scopeValid, policy, executionContext)

    // 6. Least privilege
    const leastPrivilegeFindings = evaluateLeastPrivilege(scopeValid)

    // 7. Policy evaluation
    const policyResult = evaluatePermissionPolicy(scopeValid, policy)

    // Merge scope-denied into policy result denied
    const mergedPolicyResult = {
      ...policyResult,
      denied: [...policyResult.denied, ...scopeDenied],
    }

    // 8. Build assessment
    return buildPermissionAssessment(
      permissionManifest.semanticHash,
      canonical,
      mergedPolicyResult,
      expansionFindings,
      leastPrivilegeFindings,
      policy.enforcementCapabilities,
    )
  }
}
