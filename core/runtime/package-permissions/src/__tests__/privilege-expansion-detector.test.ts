import { describe, it, expect } from 'vitest'
import { detectPrivilegeExpansion } from '../privilege-expansion-detector.js'
import type { PermissionPolicy, PermissionExecutionContext } from '../types.js'

const strictPolicy: PermissionPolicy = { rules: [], defaultEffect: 'deny', enforcementCapabilities: [] }
const emptyContext: PermissionExecutionContext = {}

describe('privilege-expansion-detector', () => {
  it('returns no findings for well-scoped permissions', () => {
    const perms = [{ domain: 'filesystem', value: '/app/data' }]
    const ctx: PermissionExecutionContext = { filesystemRoots: ['/app'] }
    const findings = detectPrivilegeExpansion(perms, strictPolicy, ctx)
    expect(findings).toHaveLength(0)
  })

  it('detects wildcard-substitution when value contains * and no wildcard policy', () => {
    const perms = [{ domain: 'filesystem', value: '/data/*' }]
    const findings = detectPrivilegeExpansion(perms, strictPolicy, emptyContext)
    expect(findings).toHaveLength(1)
    expect(findings[0]!.kind).toBe('wildcard-substitution')
  })

  it('does not flag wildcard when allowWildcardsByDefault is true', () => {
    const policy: PermissionPolicy = { ...strictPolicy, allowWildcardsByDefault: true }
    const perms = [{ domain: 'filesystem', value: '/data/*' }]
    const findings = detectPrivilegeExpansion(perms, policy, emptyContext)
    expect(findings.filter(f => f.kind === 'wildcard-substitution')).toHaveLength(0)
  })

  it('detects scope-expansion for filesystem outside roots', () => {
    const perms = [{ domain: 'filesystem', value: '/etc/passwd' }]
    const ctx: PermissionExecutionContext = { filesystemRoots: ['/app'] }
    const findings = detectPrivilegeExpansion(perms, strictPolicy, ctx)
    expect(findings).toHaveLength(1)
    expect(findings[0]!.kind).toBe('scope-expansion')
  })

  it('detects cross-tenant-expansion for secret outside namespaces', () => {
    const perms = [{ domain: 'secret', value: 'other-tenant/key' }]
    const ctx: PermissionExecutionContext = { secretNamespaces: ['my-tenant'] }
    const findings = detectPrivilegeExpansion(perms, strictPolicy, ctx)
    expect(findings).toHaveLength(1)
    expect(findings[0]!.kind).toBe('cross-tenant-expansion')
  })

  it('no findings when no context constraints set', () => {
    const perms = [{ domain: 'filesystem', value: '/etc' }]
    const findings = detectPrivilegeExpansion(perms, strictPolicy, emptyContext)
    expect(findings).toHaveLength(0)
  })
})
