/**
 * Constitutional laws for Stage 9J Task 8 — Permission Evaluation
 * Laws L-9J-701 through L-9J-714
 */
import { describe, it, expect } from 'vitest'
import { PermissionEvaluator } from '../permission-evaluator.js'
import { canonicalizePermissions } from '../permission-canonicalizer.js'
import { evaluatePermissionPolicy } from '../permission-policy-evaluator.js'
import { evaluatePermissionScope } from '../permission-scope-evaluator.js'
import { detectPrivilegeExpansion } from '../privilege-expansion-detector.js'
import type { PermissionEvaluationRequest, PermissionPolicy, PermissionExecutionContext } from '../types.js'
import type { CanonicalPermission, PackageTrustSubject, PackagePermissionManifest } from '@rohinik-org/package-trust-ir'

function makeSubject(): PackageTrustSubject {
  return {
    subjectKind: 'rohinik-package',
    packageId: 'test-pkg',
    version: '1.0.0',
    sourceIdentity: { sourceKind: 'workspace', workspaceId: 'ws1', artifactId: 'art1' },
    expectedIntegrity: { algorithm: 'sha256', encoding: 'hex', value: 'abc123' },
  }
}

function makeManifest(permissions: CanonicalPermission[]): PackagePermissionManifest {
  return { manifestVersion: '1', requestedPermissions: permissions, semanticHash: 'hash-law' }
}

function makeContext(): PermissionExecutionContext {
  return { hostEnvironment: 'test' }
}

function makePolicy(rules: PermissionPolicy['rules'], defaultEffect: 'allow' | 'deny' = 'deny'): PermissionPolicy {
  return { rules, defaultEffect, enforcementCapabilities: [] }
}

const evaluator = new PermissionEvaluator()
const AT = '2026-07-29T12:00:00.000Z'

describe('constitutional laws', () => {
  it('L-9J-701: PermissionAssessment.decision MUST be one of granted | conditionally-granted | denied', () => {
    const validValues = new Set(['granted', 'conditionally-granted', 'denied'])
    const request: PermissionEvaluationRequest = {
      subject: makeSubject(),
      permissionManifest: makeManifest([{ domain: 'filesystem', value: '/tmp', resourceConstraint: 'read' }]),
      executionContext: makeContext(),
      policy: makePolicy([{ order: 0, domain: 'filesystem', effect: 'allow' }]),
      evaluatedAt: AT,
    }
    const result = evaluator.evaluate(request)
    expect(validValues.has(result.decision)).toBe(true)
  })

  it('L-9J-702: evaluator MUST NOT call Date.now() or new Date() without argument — deterministic output', () => {
    const request: PermissionEvaluationRequest = {
      subject: makeSubject(),
      permissionManifest: makeManifest([{ domain: 'filesystem', value: '/tmp', resourceConstraint: 'read' }]),
      executionContext: makeContext(),
      policy: makePolicy([{ order: 0, domain: 'filesystem', effect: 'allow' }]),
      evaluatedAt: AT,
    }
    const r1 = evaluator.evaluate(request)
    const r2 = evaluator.evaluate(request)
    expect(r1.decision).toBe(r2.decision)
    expect(r1.grantedPermissions).toEqual(r2.grantedPermissions)
  })

  it('L-9J-703: invalid request MUST produce denied assessment (fail-closed on bad input)', () => {
    const result = evaluator.evaluate(null as unknown as PermissionEvaluationRequest)
    expect(result.decision).toBe('denied')
  })

  it('L-9J-704: PermissionEvaluator MUST NOT return PackageTrustDecision values (trusted, quarantined, etc.)', () => {
    const request: PermissionEvaluationRequest = {
      subject: makeSubject(),
      permissionManifest: makeManifest([]),
      executionContext: makeContext(),
      policy: makePolicy([], 'allow'),
      evaluatedAt: AT,
    }
    const result = evaluator.evaluate(request)
    const forbidden = new Set(['trusted', 'conditionally-trusted', 'quarantined', 'manual-review-required'])
    expect(forbidden.has(result.decision as string)).toBe(false)
  })

  it('L-9J-705: explicit deny rule MUST override allow rule for the same permission', () => {
    const policy: PermissionPolicy = {
      rules: [
        { order: 0, domain: 'filesystem', effect: 'allow' },
        { order: 1, domain: 'filesystem', effect: 'deny' },
      ],
      defaultEffect: 'allow',
      enforcementCapabilities: [],
    }
    const perms: CanonicalPermission[] = [{ domain: 'filesystem', value: '/tmp' }]
    const result = evaluatePermissionPolicy(perms, policy)
    expect(result.denied).toHaveLength(1)
    expect(result.granted).toHaveLength(0)
  })

  it('L-9J-706: equal-specificity conflicting rules MUST fail closed (denied)', () => {
    const policy: PermissionPolicy = {
      rules: [
        { order: 0, domain: 'filesystem', effect: 'allow' },
        { order: 0, domain: 'filesystem', effect: 'conditional', conditionId: 'c1' },
      ],
      defaultEffect: 'allow',
      enforcementCapabilities: [],
    }
    const perms: CanonicalPermission[] = [{ domain: 'filesystem', value: '/tmp' }]
    const result = evaluatePermissionPolicy(perms, policy)
    expect(result.hasConflict).toBe(true)
    expect(result.denied.some(d => d.reason === 'policy-conflict')).toBe(true)
  })

  it('L-9J-707: canonicalization MUST keep different domains with same value as distinct entries', () => {
    const perms: CanonicalPermission[] = [
      { domain: 'network', value: 'shared' },
      { domain: 'filesystem', value: 'shared' },
    ]
    const result = canonicalizePermissions(perms)
    expect(result).toHaveLength(2)
    expect(result.some(p => p.domain === 'network')).toBe(true)
    expect(result.some(p => p.domain === 'filesystem')).toBe(true)
  })

  it('L-9J-708: scope normalization MUST NOT widen access — path traversal rejected', () => {
    const perm: CanonicalPermission = { domain: 'filesystem', value: '../../../etc' }
    const ctx: PermissionExecutionContext = { filesystemRoots: ['/app'] }
    const policy = makePolicy([])
    const result = evaluatePermissionScope(perm, policy, ctx)
    expect(result.valid).toBe(false)
  })

  it('L-9J-709: permission assessment MUST reference the manifest semanticHash', () => {
    const request: PermissionEvaluationRequest = {
      subject: makeSubject(),
      permissionManifest: { manifestVersion: '1', requestedPermissions: [], semanticHash: 'specific-hash-xyz' },
      executionContext: makeContext(),
      policy: makePolicy([]),
      evaluatedAt: AT,
    }
    const result = evaluator.evaluate(request)
    expect(result.manifestSemanticHash).toBe('specific-hash-xyz')
  })

  it('L-9J-710: wildcard permissions MUST be detected as expansion findings when not explicitly allowed', () => {
    const perms: CanonicalPermission[] = [{ domain: 'filesystem', value: '/data/*' }]
    const policy = makePolicy([])
    const ctx = makeContext()
    const findings = detectPrivilegeExpansion(perms, policy, ctx)
    expect(findings.some(f => f.kind === 'wildcard-substitution')).toBe(true)
  })

  it('L-9J-711: expansion findings MUST cause denied decision in final assessment', () => {
    const request: PermissionEvaluationRequest = {
      subject: makeSubject(),
      permissionManifest: makeManifest([{ domain: 'filesystem', value: '/etc/shadow', resourceConstraint: 'read' }]),
      executionContext: { filesystemRoots: ['/app'] },
      policy: makePolicy([{ order: 0, domain: 'filesystem', effect: 'allow' }]),
      evaluatedAt: AT,
    }
    const result = evaluator.evaluate(request)
    expect(result.decision).toBe('denied')
  })

  it('L-9J-712: canonicalize MUST be idempotent', () => {
    const perms: CanonicalPermission[] = [
      { domain: 'network', value: 'z.com' },
      { domain: 'filesystem', value: '/tmp' },
      { domain: 'filesystem', value: '/tmp' },
    ]
    const once = canonicalizePermissions(perms)
    const twice = canonicalizePermissions(once)
    expect(twice).toEqual(once)
  })

  it('L-9J-713: unenforceablePermissions MUST list domains where enforced is false', () => {
    const request: PermissionEvaluationRequest = {
      subject: makeSubject(),
      permissionManifest: makeManifest([{ domain: 'device', value: 'camera', resourceConstraint: 'capture' }]),
      executionContext: makeContext(),
      policy: {
        rules: [{ order: 0, domain: 'device', effect: 'allow' }],
        defaultEffect: 'deny',
        enforcementCapabilities: [{ domain: 'device', enforced: false }],
      },
      evaluatedAt: AT,
    }
    const result = evaluator.evaluate(request)
    expect(result.enforcementAssessment.unenforceablePermissions).toContain('device')
    expect(result.enforcementAssessment.enforceable).toBe(false)
  })

  it('L-9J-714: policy defaultEffect deny MUST deny permissions with no matching rule', () => {
    const request: PermissionEvaluationRequest = {
      subject: makeSubject(),
      permissionManifest: makeManifest([{ domain: 'network', value: 'api.example.com', resourceConstraint: ':443' }]),
      executionContext: makeContext(),
      policy: makePolicy([/* no rules for network */{ order: 0, domain: 'filesystem', effect: 'allow' }], 'deny'),
      evaluatedAt: AT,
    }
    const result = evaluator.evaluate(request)
    expect(result.deniedPermissions.some(d => d.permission.domain === 'network')).toBe(true)
  })
})
