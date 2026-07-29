import { describe, it, expect } from 'vitest'
import { canonicalizePermissions } from '../permission-canonicalizer.js'
import type { CanonicalPermission } from '@rohinik-org/package-trust-ir'

describe('permission-canonicalizer', () => {
  it('removes exact duplicates', () => {
    const perms: CanonicalPermission[] = [
      { domain: 'filesystem', value: '/tmp' },
      { domain: 'filesystem', value: '/tmp' },
    ]
    const result = canonicalizePermissions(perms)
    expect(result).toHaveLength(1)
  })

  it('sorts by domain then value', () => {
    const perms: CanonicalPermission[] = [
      { domain: 'network', value: 'api.example.com' },
      { domain: 'filesystem', value: '/tmp' },
    ]
    const result = canonicalizePermissions(perms)
    expect(result[0]!.domain).toBe('filesystem')
    expect(result[1]!.domain).toBe('network')
  })

  it('sorts by resourceConstraint when domain+value equal', () => {
    const perms: CanonicalPermission[] = [
      { domain: 'filesystem', value: '/data', resourceConstraint: 'write' },
      { domain: 'filesystem', value: '/data', resourceConstraint: 'read' },
    ]
    const result = canonicalizePermissions(perms)
    expect(result[0]!.resourceConstraint).toBe('read')
    expect(result[1]!.resourceConstraint).toBe('write')
  })

  it('is idempotent', () => {
    const perms: CanonicalPermission[] = [
      { domain: 'network', value: 'b.com' },
      { domain: 'filesystem', value: '/tmp' },
      { domain: 'filesystem', value: '/tmp' },
    ]
    const once = canonicalizePermissions(perms)
    const twice = canonicalizePermissions(once)
    expect(twice).toEqual(once)
  })

  it('keeps different domains with same value distinct (L-9J-707)', () => {
    const perms: CanonicalPermission[] = [
      { domain: 'network', value: 'shared' },
      { domain: 'filesystem', value: 'shared' },
    ]
    const result = canonicalizePermissions(perms)
    expect(result).toHaveLength(2)
  })

  it('preserves deny-flavor permissions', () => {
    const perms: CanonicalPermission[] = [
      { domain: 'filesystem', value: 'deny:/sensitive' },
    ]
    const result = canonicalizePermissions(perms)
    expect(result).toHaveLength(1)
    expect(result[0]!.value).toBe('deny:/sensitive')
  })
})
