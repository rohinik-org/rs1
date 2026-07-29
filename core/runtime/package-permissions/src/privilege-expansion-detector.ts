import type {
  CanonicalPermission,
  PermissionExecutionContext,
  PermissionPolicy,
  PrivilegeExpansionFinding,
} from './types.js'

// ponytail: action strength tables — add domains as IR expands
const ACTION_STRENGTH: Record<string, Record<string, number>> = {
  filesystem: { read: 1, write: 2, create: 2, delete: 3, execute: 4 },
  process: { inspect: 1, signal: 2, spawn: 3, terminate: 3 },
  device: { read: 1, control: 2, exclusive: 3 },
  secret: { read: 1, write: 2 },
  network: { connect: 1, listen: 2 },
}

function parseAction(value: string): { action: string; resource: string } | undefined {
  const idx = value.indexOf(':')
  if (idx < 0) return undefined
  return { action: value.slice(0, idx), resource: value.slice(idx + 1) }
}

function actionStrength(domain: string, action: string): number {
  return ACTION_STRENGTH[domain]?.[action] ?? 0
}

/** Compare declared vs requested for action escalation and scope expansion.
 *  Called only when declaredPermissions is explicitly provided. */
export function detectDeclarationVsRequest(
  declared: readonly CanonicalPermission[],
  requested: readonly CanonicalPermission[],
): readonly PrivilegeExpansionFinding[] {
  const findings: PrivilegeExpansionFinding[] = []

  for (const req of requested) {
    const reqParsed = parseAction(req.value)
    const domainDeclared = declared.filter(d => d.domain === req.domain)

    if (domainDeclared.length === 0) {
      // No declared permission for this domain at all — undeclared
      findings.push({
        kind: 'undeclared-permission',
        permission: req,
        reason: `domain '${req.domain}' was not declared`,
      })
      continue
    }

    if (!reqParsed) continue // no action component, skip escalation check

    const reqStrength = actionStrength(req.domain, reqParsed.action)
    if (reqStrength === 0) continue // unknown action

    // Find any declared permission covering the same resource
    const matchingDeclared = domainDeclared.find(d => {
      const dp = parseAction(d.value)
      return dp !== undefined && (dp.resource === reqParsed.resource || reqParsed.resource.startsWith(dp.resource + '/'))
    })

    if (matchingDeclared) {
      const declParsed = parseAction(matchingDeclared.value)!
      const declStrength = actionStrength(req.domain, declParsed.action)
      if (reqStrength > declStrength) {
        findings.push({
          kind: 'action-escalation',
          permission: req,
          reason: `declared '${matchingDeclared.value}' (strength ${declStrength}) but requested '${req.value}' (strength ${reqStrength})`,
        })
      }
    } else {
      // Resource not covered by any declaration — check scope expansion
      // If any declared covers a narrower scope (declared is a child of requested), that is scope expansion
      const narrowerDeclared = domainDeclared.find(d => {
        const dp = parseAction(d.value)
        return dp !== undefined && dp.resource.startsWith(reqParsed.resource + '/')
      })
      if (narrowerDeclared) {
        findings.push({
          kind: 'scope-expansion',
          permission: req,
          reason: `declared '${narrowerDeclared.value}' but requested broader scope '${req.value}'`,
        })
      }
    }
  }

  return findings
}

export function detectPrivilegeExpansion(
  permissions: readonly CanonicalPermission[],
  policy: PermissionPolicy,
  context: PermissionExecutionContext,
  declared?: readonly CanonicalPermission[],
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

  // Action escalation / scope expansion vs explicit declarations
  if (declared !== undefined) {
    const declarationFindings = detectDeclarationVsRequest(declared, permissions)
    findings.push(...declarationFindings)
  }

  return findings
}
