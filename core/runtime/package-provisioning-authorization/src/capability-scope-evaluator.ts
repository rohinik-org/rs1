import type {
  RequestedCapability,
  RequestedPermission,
  PackageProvisioningAuthorizationPolicy,
  CapabilityScopeEvaluation,
  CapabilityRestriction,
  AuthorizationReason,
} from './types.js'

export function evaluateCapabilityScope(
  requested: readonly RequestedCapability[],
  policy: PackageProvisioningAuthorizationPolicy,
  declaredCapabilities: readonly string[],
  trustRestrictedCapabilities: readonly string[] = [],
  tenantRestrictedCapabilities: readonly string[] = [],
  environmentRestrictedCapabilities: readonly string[] = [],
): CapabilityScopeEvaluation {
  const maxIds = new Set(policy.maxCapabilityScope.map(c => c.capabilityId))
  const allowed: RequestedCapability[] = []
  const denied: RequestedCapability[] = []
  const restricted: CapabilityRestriction[] = []
  const reasons: AuthorizationReason[] = []

  for (const cap of requested) {
    const id = cap.capabilityId

    if (!declaredCapabilities.includes(id)) {
      denied.push(cap)
      reasons.push({ code: 'capability-not-declared', detail: `Capability '${id}' is not declared by package` })
      continue
    }
    if (maxIds.size > 0 && !maxIds.has(id)) {
      denied.push(cap)
      reasons.push({ code: 'capability-exceeds-policy-max', detail: `Capability '${id}' exceeds policy max scope` })
      continue
    }
    if (trustRestrictedCapabilities.includes(id)) {
      denied.push(cap)
      reasons.push({ code: 'capability-trust-restricted', detail: `Capability '${id}' is restricted by trust decision` })
      continue
    }
    if (tenantRestrictedCapabilities.includes(id)) {
      denied.push(cap)
      reasons.push({ code: 'capability-tenant-restricted', detail: `Capability '${id}' is restricted by tenant policy` })
      continue
    }
    if (environmentRestrictedCapabilities.includes(id)) {
      restricted.push({ capabilityId: id, conditionKind: 'environment-limited' })
      allowed.push(cap)
      continue
    }
    allowed.push(cap)
  }

  return { allowed, denied, restricted, reasons }
}

export function evaluatePermissionScope(
  requested: readonly RequestedPermission[],
  policy: PackageProvisioningAuthorizationPolicy,
  declaredPermissions: readonly string[],
  trustRestrictedPermissions: readonly string[] = [],
  tenantRestrictedPermissions: readonly string[] = [],
  environmentRestrictedPermissions: readonly string[] = [],
): { allowed: readonly RequestedPermission[]; denied: readonly RequestedPermission[]; reasons: readonly AuthorizationReason[] } {
  const maxIds = new Set(policy.maxPermissionScope.map(p => p.permissionId))
  const allowed: RequestedPermission[] = []
  const denied: RequestedPermission[] = []
  const reasons: AuthorizationReason[] = []

  for (const perm of requested) {
    const id = perm.permissionId

    if (!declaredPermissions.includes(id)) {
      denied.push(perm)
      reasons.push({ code: 'permission-not-declared', detail: `Permission '${id}' is not declared by package` })
      continue
    }
    if (maxIds.size > 0 && !maxIds.has(id)) {
      denied.push(perm)
      reasons.push({ code: 'permission-exceeds-policy-max', detail: `Permission '${id}' exceeds policy max scope` })
      continue
    }
    if (trustRestrictedPermissions.includes(id)) {
      denied.push(perm)
      reasons.push({ code: 'permission-trust-restricted', detail: `Permission '${id}' is restricted by trust decision` })
      continue
    }
    if (tenantRestrictedPermissions.includes(id)) {
      denied.push(perm)
      reasons.push({ code: 'permission-tenant-restricted', detail: `Permission '${id}' is restricted by tenant policy` })
      continue
    }
    if (environmentRestrictedPermissions.includes(id)) {
      denied.push(perm)
      reasons.push({ code: 'permission-environment-restricted', detail: `Permission '${id}' is restricted by environment policy` })
      continue
    }
    allowed.push(perm)
  }

  return { allowed, denied, reasons }
}
