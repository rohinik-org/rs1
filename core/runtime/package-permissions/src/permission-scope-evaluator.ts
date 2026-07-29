import type { CanonicalPermission, PermissionExecutionContext, PermissionPolicy } from './types.js'

export interface ScopeEvaluationResult {
  readonly valid: boolean
  readonly reason?: string
}

const SHELL_EXECUTABLES = new Set(['/bin/sh', '/bin/bash', 'cmd.exe', 'powershell.exe', 'sh'])

function isPrivateCidr(value: string): boolean {
  return value === '0.0.0.0/0'
}

function isPortValid(port: string): boolean {
  const n = parseInt(port, 10)
  return !isNaN(n) && n >= 1 && n <= 65535
}

function isWithinAllowedRoot(value: string, roots: readonly string[]): boolean {
  if (roots.length === 0) return true
  return roots.some(root => value === root || value.startsWith(root + '/') || value.startsWith(root + '\\'))
}

export function evaluatePermissionScope(
  permission: CanonicalPermission,
  policy: PermissionPolicy,
  context: PermissionExecutionContext,
): ScopeEvaluationResult {
  const { domain, value, resourceConstraint } = permission
  const allowWildcards = policy.allowWildcardsByDefault === true

  switch (domain) {
    case 'filesystem': {
      if (value.includes('..')) {
        return { valid: false, reason: 'path traversal detected in filesystem permission value' }
      }
      if ((value === '/' || value === '*') && !allowWildcards) {
        return { valid: false, reason: 'wildcard or root filesystem access requires allowWildcardsByDefault' }
      }
      if (context.filesystemRoots && context.filesystemRoots.length > 0) {
        if (!isWithinAllowedRoot(value, context.filesystemRoots)) {
          return { valid: false, reason: `filesystem path '${value}' is not within allowed roots` }
        }
      }
      if (resourceConstraint && context.filesystemRoots && context.filesystemRoots.length > 0) {
        // Reject resourceConstraint that is a parent of an allowed root
        for (const root of context.filesystemRoots) {
          if (root.startsWith(resourceConstraint + '/') || root.startsWith(resourceConstraint + '\\')) {
            return { valid: false, reason: `resourceConstraint '${resourceConstraint}' is a parent of an allowed root` }
          }
        }
      }
      return { valid: true }
    }

    case 'network': {
      if (value === '*' && !allowWildcards) {
        return { valid: false, reason: 'wildcard network access requires allowWildcardsByDefault' }
      }
      if (isPrivateCidr(value)) {
        return { valid: false, reason: 'private CIDR wildcard 0.0.0.0/0 is not allowed' }
      }
      if (resourceConstraint) {
        const port = resourceConstraint.replace(/^:/, '')
        if (port && !isPortValid(port)) {
          return { valid: false, reason: `invalid port in resourceConstraint: '${resourceConstraint}'` }
        }
      }
      return { valid: true }
    }

    case 'secret': {
      if (value === '*') {
        return { valid: false, reason: 'global secret access (* value) is not allowed' }
      }
      if (context.tenantId) {
        const prefix = context.tenantId + '/'
        if (!value.startsWith(prefix)) {
          return { valid: false, reason: `secret '${value}' is not scoped to tenant '${context.tenantId}'` }
        }
      }
      return { valid: true }
    }

    case 'process': {
      if (value === '*') {
        return { valid: false, reason: 'arbitrary process execution (* value) is not allowed' }
      }
      if (SHELL_EXECUTABLES.has(value)) {
        return { valid: false, reason: `shell executable '${value}' is not allowed` }
      }
      return { valid: true }
    }

    case 'device': {
      if (value === '*' && !allowWildcards) {
        return { valid: false, reason: 'wildcard device access requires allowWildcardsByDefault' }
      }
      return { valid: true }
    }

    default: {
      if (!value || value.trim() === '') {
        return { valid: false, reason: `permission value must be non-empty for domain '${domain}'` }
      }
      return { valid: true }
    }
  }
}
