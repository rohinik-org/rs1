import type { CanonicalPermission, LeastPrivilegeFinding } from './types.js'

export function evaluateLeastPrivilege(
  permissions: readonly CanonicalPermission[],
): readonly LeastPrivilegeFinding[] {
  const findings: LeastPrivilegeFinding[] = []

  for (const permission of permissions) {
    const { domain, value, resourceConstraint } = permission

    if (value === '*') {
      findings.push({
        kind: 'global-scope',
        permission,
        reason: `permission value '*' grants global scope in domain '${domain}'`,
      })
    }

    if (domain === 'administrative') {
      findings.push({
        kind: 'redundant-administrative',
        permission,
        reason: `administrative domain permission '${value}' requires justification`,
      })
    }

    if ((domain === 'filesystem' || domain === 'network') && resourceConstraint === undefined) {
      findings.push({
        kind: 'unexplained-broad-permission',
        permission,
        reason: `${domain} permission '${value}' has no resourceConstraint — scope is unbounded`,
      })
    }
  }

  return findings
}
