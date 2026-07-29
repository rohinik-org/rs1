import type { CanonicalPermission } from './types.js'

function permKey(p: CanonicalPermission): string {
  return `${p.domain}\0${p.value}\0${p.resourceConstraint ?? ''}`
}

function comparePerms(a: CanonicalPermission, b: CanonicalPermission): number {
  const da = a.domain.localeCompare(b.domain)
  if (da !== 0) return da
  const dv = a.value.localeCompare(b.value)
  if (dv !== 0) return dv
  return (a.resourceConstraint ?? '').localeCompare(b.resourceConstraint ?? '')
}

export function canonicalizePermissions(
  permissions: readonly CanonicalPermission[],
): readonly CanonicalPermission[] {
  const seen = new Set<string>()
  const unique: CanonicalPermission[] = []
  for (const p of permissions) {
    const k = permKey(p)
    if (!seen.has(k)) {
      seen.add(k)
      unique.push(p)
    }
  }
  return unique.sort(comparePerms)
}
