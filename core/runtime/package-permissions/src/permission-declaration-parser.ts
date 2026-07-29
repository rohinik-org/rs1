import type { CanonicalPermission } from './types.js'

export interface ParsedDeclarations {
  readonly parsed: readonly CanonicalPermission[]
  readonly duplicateExact: readonly CanonicalPermission[]
  readonly conflicting: readonly CanonicalPermission[]
}

export type ParseResult =
  | { readonly ok: true; readonly value: ParsedDeclarations }
  | { readonly ok: false; readonly reason: string }

function permKey(p: CanonicalPermission): string {
  return `${p.domain}\0${p.value}\0${p.resourceConstraint ?? ''}`
}

function domainValueKey(p: CanonicalPermission): string {
  return `${p.domain}\0${p.value}`
}

export function parsePermissionDeclarations(
  permissions: readonly unknown[],
): ParseResult {
  if (!Array.isArray(permissions)) {
    return { ok: false, reason: 'requestedPermissions must be an array' }
  }

  const parsed: CanonicalPermission[] = []

  for (const p of permissions) {
    if (!p || typeof p !== 'object') {
      return { ok: false, reason: 'each permission must be an object' }
    }
    const perm = p as Partial<CanonicalPermission>
    if (typeof perm.domain !== 'string' || perm.domain.trim() === '') {
      return { ok: false, reason: 'permission.domain must be a non-empty string' }
    }
    if (typeof perm.value !== 'string' || perm.value.trim() === '') {
      return { ok: false, reason: 'permission.value must be a non-empty string' }
    }
    parsed.push(perm as CanonicalPermission)
  }

  // Detect exact duplicates
  const seen = new Set<string>()
  const duplicateExact: CanonicalPermission[] = []
  for (const p of parsed) {
    const k = permKey(p)
    if (seen.has(k)) {
      duplicateExact.push(p)
    } else {
      seen.add(k)
    }
  }

  // Detect conflicting: same domain+value but different resourceConstraint where one is a superset
  // Simple heuristic: if one has no resourceConstraint and another has one, the unconstrained is a superset
  const byDomainValue = new Map<string, CanonicalPermission[]>()
  for (const p of parsed) {
    const k = domainValueKey(p)
    const group = byDomainValue.get(k) ?? []
    group.push(p)
    byDomainValue.set(k, group)
  }

  const conflicting: CanonicalPermission[] = []
  for (const group of byDomainValue.values()) {
    if (group.length < 2) continue
    const hasUnconstrained = group.some(p => p.resourceConstraint === undefined)
    const hasConstrained = group.some(p => p.resourceConstraint !== undefined)
    if (hasUnconstrained && hasConstrained) {
      conflicting.push(...group)
    }
  }

  return { ok: true, value: { parsed, duplicateExact, conflicting } }
}
