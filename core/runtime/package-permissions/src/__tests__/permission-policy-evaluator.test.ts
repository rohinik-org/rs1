import { describe, it, expect } from 'vitest'
import { evaluatePermissionPolicy } from '../permission-policy-evaluator.js'
import type { PermissionPolicy } from '../types.js'
import type { CanonicalPermission } from '@rohinik-org/package-trust-ir'

function makeAllowRule(domain: string, order = 0) {
  return { order, domain, effect: 'allow' as const }
}

function makeDenyRule(domain: string, order = 0) {
  return { order, domain, effect: 'deny' as const }
}

function makeConditionalRule(domain: string, conditionId: string, order = 0) {
  return { order, domain, effect: 'conditional' as const, conditionId }
}

describe('permission-policy-evaluator', () => {
  it('grants permission matching allow rule', () => {
    const policy: PermissionPolicy = {
      rules: [makeAllowRule('filesystem')],
      defaultEffect: 'deny',
      enforcementCapabilities: [],
    }
    const perms: CanonicalPermission[] = [{ domain: 'filesystem', value: '/tmp' }]
    const result = evaluatePermissionPolicy(perms, policy)
    expect(result.granted).toHaveLength(1)
    expect(result.denied).toHaveLength(0)
  })

  it('denies permission matching deny rule (L-9J-705: explicit deny overrides)', () => {
    const policy: PermissionPolicy = {
      rules: [makeAllowRule('filesystem', 0), makeDenyRule('filesystem', 1)],
      defaultEffect: 'allow',
      enforcementCapabilities: [],
    }
    const perms: CanonicalPermission[] = [{ domain: 'filesystem', value: '/tmp' }]
    const result = evaluatePermissionPolicy(perms, policy)
    expect(result.denied).toHaveLength(1)
    expect(result.denied[0]!.reason).toBe('policy-deny')
  })

  it('applies defaultEffect deny when no matching rule', () => {
    const policy: PermissionPolicy = {
      rules: [],
      defaultEffect: 'deny',
      enforcementCapabilities: [],
    }
    const perms: CanonicalPermission[] = [{ domain: 'filesystem', value: '/tmp' }]
    const result = evaluatePermissionPolicy(perms, policy)
    expect(result.denied).toHaveLength(1)
    expect(result.denied[0]!.reason).toBe('no-matching-rule')
  })

  it('applies defaultEffect allow when no matching rule', () => {
    const policy: PermissionPolicy = {
      rules: [],
      defaultEffect: 'allow',
      enforcementCapabilities: [],
    }
    const perms: CanonicalPermission[] = [{ domain: 'filesystem', value: '/tmp' }]
    const result = evaluatePermissionPolicy(perms, policy)
    expect(result.granted).toHaveLength(1)
  })

  it('produces conditionally-granted with conditionId for conditional rule', () => {
    const policy: PermissionPolicy = {
      rules: [makeConditionalRule('filesystem', 'requires-audit')],
      defaultEffect: 'deny',
      enforcementCapabilities: [],
    }
    const perms: CanonicalPermission[] = [{ domain: 'filesystem', value: '/tmp' }]
    const result = evaluatePermissionPolicy(perms, policy)
    expect(result.granted).toHaveLength(1)
    expect(result.granted[0]!.conditionId).toBe('requires-audit')
  })

  it('detects conflict at same order (L-9J-706: fail closed)', () => {
    const policy: PermissionPolicy = {
      rules: [
        { order: 0, domain: 'filesystem', effect: 'allow' },
        { order: 0, domain: 'filesystem', effect: 'conditional', conditionId: 'c1' },
      ],
      defaultEffect: 'deny',
      enforcementCapabilities: [],
    }
    const perms: CanonicalPermission[] = [{ domain: 'filesystem', value: '/tmp' }]
    const result = evaluatePermissionPolicy(perms, policy)
    expect(result.hasConflict).toBe(true)
    expect(result.denied).toHaveLength(1)
    expect(result.denied[0]!.reason).toBe('policy-conflict')
  })

  it('matches rule by resourcePattern prefix', () => {
    const policy: PermissionPolicy = {
      rules: [{ order: 0, domain: 'filesystem', resourcePattern: '/app', effect: 'allow' }],
      defaultEffect: 'deny',
      enforcementCapabilities: [],
    }
    const perms: CanonicalPermission[] = [{ domain: 'filesystem', value: '/app/data' }]
    const result = evaluatePermissionPolicy(perms, policy)
    expect(result.granted).toHaveLength(1)
  })

  it('does not match rule when value does not start with resourcePattern', () => {
    const policy: PermissionPolicy = {
      rules: [{ order: 0, domain: 'filesystem', resourcePattern: '/app', effect: 'allow' }],
      defaultEffect: 'deny',
      enforcementCapabilities: [],
    }
    const perms: CanonicalPermission[] = [{ domain: 'filesystem', value: '/etc/passwd' }]
    const result = evaluatePermissionPolicy(perms, policy)
    expect(result.denied).toHaveLength(1)
  })

  it('combination rule triggers deny when all domains present', () => {
    const policy: PermissionPolicy = {
      rules: [
        { order: 0, domain: 'filesystem', effect: 'allow' },
        { order: 0, domain: 'network', effect: 'allow' },
      ],
      defaultEffect: 'deny',
      enforcementCapabilities: [],
      combinationRules: [{ domains: ['filesystem', 'network'], ruleId: 'combo-danger', severity: 'deny' }],
    }
    const perms: CanonicalPermission[] = [
      { domain: 'filesystem', value: '/tmp' },
      { domain: 'network', value: 'api.example.com' },
    ]
    const result = evaluatePermissionPolicy(perms, policy)
    expect(result.denied.some(d => d.reason.includes('combo-danger'))).toBe(true)
  })
})
