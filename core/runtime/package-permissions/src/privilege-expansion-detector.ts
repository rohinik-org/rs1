import type {
  CanonicalPermission,
  PermissionExecutionContext,
  PermissionPolicy,
  PrivilegeExpansionFinding,
} from './types.js'

export function detectPrivilegeExpansion(
  permissions: readonly CanonicalPermission[],
  policy: PermissionPolicy,
  context: PermissionExecutionContext,
): readonly PrivilegeExpansionFinding[] {
  const findings: PrivilegeExpansionFinding[] = []
  const allowWildcards = policy.allowWildcardsByDefault === true

  for (const permission of permissions) {
    const { domain, value } = permission

    // Wildcard substitution
    if (value.includes('*') && !allowWildcards) {
      findings.push({
        kind: 'wildcard-substitution',
        permission,
        reason: `permission value '${value}' contains wildcard but allowWildcardsByDefault is false`,
      })
      continue // single finding per permission, most specific first
    }

    // Filesystem scope expansion vs allowed roots
    if (domain === 'filesystem' && context.filesystemRoots && context.filesystemRoots.length > 0) {
      const withinRoot = context.filesystemRoots.some(
        root => value === root || value.startsWith(root + '/') || value.startsWith(root + '\\'),
      )
      if (!withinRoot) {
        findings.push({
          kind: 'scope-expansion',
          permission,
          reason: `filesystem path '${value}' is outside allowed roots [${context.filesystemRoots.join(', ')}]`,
        })
        continue
      }
    }

    // Cross-tenant secret expansion
    if (domain === 'secret' && context.secretNamespaces && context.secretNamespaces.length > 0) {
      const withinNamespace = context.secretNamespaces.some(ns => value === ns || value.startsWith(ns + '/'))
      if (!withinNamespace) {
        findings.push({
          kind: 'cross-tenant-expansion',
          permission,
          reason: `secret '${value}' is outside allowed namespaces [${context.secretNamespaces.join(', ')}]`,
        })
      }
    }
  }

  return findings
}
