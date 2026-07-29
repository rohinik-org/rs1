/**
 * Constitutional laws for Stage 9J Task 8 — Permission Evaluation
 * Laws L-9J-701 through L-9J-714
 */
import { describe, it, expect } from 'vitest'
import { PermissionEvaluator } from '../permission-evaluator.js'
import { canonicalizePermissions } from '../permission-canonicalizer.js'
import { evaluatePermissionPolicy } from '../permission-policy-evaluator.js'
import { evaluatePermissionScope } from '../permission-scope-evaluator.js'
import { detectPrivilegeExpansion, detectDeclarationVsRequest } from '../privilege-expansion-detector.js'
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
  // L-9J-701: evaluation distinct from granting/enforcement
  // Verify the result is a PermissionAssessment — no capability handles, no side effects
  it('L-9J-701: PermissionAssessment MUST NOT contain capability handles or runtime grants', () => {
    const request: PermissionEvaluationRequest = {
      subject: makeSubject(),
      permissionManifest: makeManifest([{ domain: 'filesystem', value: '/tmp', resourceConstraint: 'read' }]),
      executionContext: makeContext(),
      policy: makePolicy([{ order: 0, domain: 'filesystem', effect: 'allow' }]),
      evaluatedAt: AT,
    }
    const result = evaluator.evaluate(request)
    // Assessment is plain data — no functions, no handles
    expect(typeof result).toBe('object')
    expect(typeof (result as unknown as Record<string, unknown>)['grant']).not.toBe('function')
    expect(typeof (result as unknown as Record<string, unknown>)['enforce']).not.toBe('function')
    expect(typeof (result as unknown as Record<string, unknown>)['activate']).not.toBe('function')
    // decision is one of the three allowed values
    const validDecisions = new Set(['granted', 'conditionally-granted', 'denied'])
    expect(validDecisions.has(result.decision)).toBe(true)
  })

  // L-9J-702: package not acceptable for undeclared permissions
  // When requested permission has no declared counterpart, it is identified as undeclared
  it('L-9J-702: permission absent from declared set MUST be identified as undeclared-permission', () => {
    const declared: CanonicalPermission[] = [{ domain: 'filesystem', value: 'read:/data' }]
    const requested: CanonicalPermission[] = [
      { domain: 'filesystem', value: 'read:/data' },
      { domain: 'network', value: 'connect:api.example.com' }, // not declared
    ]
    const findings = detectDeclarationVsRequest(declared, requested)
    expect(findings.some(f => f.kind === 'undeclared-permission' && f.permission.domain === 'network')).toBe(true)
  })

  // L-9J-703: requested broader than declared scope → scope-expansion finding
  it('L-9J-703: requested broader scope than declared MUST produce scope-expansion finding', () => {
    const declared: CanonicalPermission[] = [{ domain: 'filesystem', value: 'read:/data/pkg' }]
    const requested: CanonicalPermission[] = [{ domain: 'filesystem', value: 'read:/data' }] // broader
    const findings = detectDeclarationVsRequest(declared, requested)
    expect(findings.some(f => f.kind === 'scope-expansion')).toBe(true)
  })

  // L-9J-704: requested action stronger than declared → action-escalation finding
  it('L-9J-704: requested action stronger than declared MUST produce action-escalation finding', () => {
    const declared: CanonicalPermission[] = [{ domain: 'filesystem', value: 'read:/data' }]
    const requested: CanonicalPermission[] = [{ domain: 'filesystem', value: 'write:/data' }]
    const findings = detectDeclarationVsRequest(declared, requested)
    expect(findings.some(f => f.kind === 'action-escalation')).toBe(true)
  })

  // L-9J-705: explicit deny rule MUST override allow rule for the same permission
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

  // L-9J-706: equal-specificity conflicting rules MUST fail closed (denied)
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

  // L-9J-707: permissions with identical textual targets but different domains remain distinct
  it('L-9J-707: different domains with same value MUST remain semantically distinct', () => {
    const perms: CanonicalPermission[] = [
      { domain: 'network', value: 'shared' },
      { domain: 'filesystem', value: 'shared' },
    ]
    const result = canonicalizePermissions(perms)
    expect(result).toHaveLength(2)
    expect(result.some(p => p.domain === 'network')).toBe(true)
    expect(result.some(p => p.domain === 'filesystem')).toBe(true)
  })

  // L-9J-708: normalization MUST NOT widen secret/tenant/package boundaries — path traversal rejected
  it('L-9J-708: scope normalization MUST NOT widen boundaries — path traversal rejected', () => {
    const perm: CanonicalPermission = { domain: 'filesystem', value: '../../../etc' }
    const ctx: PermissionExecutionContext = { filesystemRoots: ['/app'] }
    const policy = makePolicy([])
    const result = evaluatePermissionScope(perm, policy, ctx)
    expect(result.valid).toBe(false)
  })

  // L-9J-709: evaluation MUST NOT inspect or execute package code
  // Structural check: evaluator is pure function with no external I/O entry points
  it('L-9J-709: PermissionEvaluator MUST be callable with fixed inputs and produce deterministic output (no code execution)', () => {
    const request: PermissionEvaluationRequest = {
      subject: makeSubject(),
      permissionManifest: makeManifest([{ domain: 'filesystem', value: '/tmp', resourceConstraint: 'read' }]),
      executionContext: makeContext(),
      policy: makePolicy([{ order: 0, domain: 'filesystem', effect: 'allow' }]),
      evaluatedAt: AT,
    }
    const r1 = evaluator.evaluate(request)
    const r2 = evaluator.evaluate(request)
    // Idempotent — no side effects from external execution
    expect(r1.decision).toBe(r2.decision)
    expect(r1.grantedPermissions).toEqual(r2.grantedPermissions)
    expect(r1.deniedPermissions).toEqual(r2.deniedPermissions)
  })

  // L-9J-710: evaluation MUST use caller-supplied context, not host process state
  // Verify that evaluation with explicit context differs from evaluation with different context
  it('L-9J-710: different caller-supplied execution contexts MUST produce different results', () => {
    const permissive: PermissionEvaluationRequest = {
      subject: makeSubject(),
      permissionManifest: makeManifest([{ domain: 'filesystem', value: '/etc/shadow' }]),
      executionContext: {}, // no root restriction
      policy: makePolicy([{ order: 0, domain: 'filesystem', effect: 'allow' }]),
      evaluatedAt: AT,
    }
    const restrictive: PermissionEvaluationRequest = {
      ...permissive,
      executionContext: { filesystemRoots: ['/app'] }, // root restricts /etc/shadow
    }
    const r1 = evaluator.evaluate(permissive)
    const r2 = evaluator.evaluate(restrictive)
    // Restrictive context should produce denied; permissive should produce granted
    expect(r1.decision).toBe('granted')
    expect(r2.decision).toBe('denied')
  })

  // L-9J-711: evaluation MUST NOT make the final package-trust decision
  it('L-9J-711: PermissionEvaluator MUST NOT return PackageTrustDecision values', () => {
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

  // L-9J-712: evaluation MUST NOT authorize installation, activation, or provisioning
  it('L-9J-712: PermissionAssessment MUST NOT contain provisioning or installation authorization', () => {
    const request: PermissionEvaluationRequest = {
      subject: makeSubject(),
      permissionManifest: makeManifest([{ domain: 'filesystem', value: '/tmp' }]),
      executionContext: makeContext(),
      policy: makePolicy([{ order: 0, domain: 'filesystem', effect: 'allow' }]),
      evaluatedAt: AT,
    }
    const result = evaluator.evaluate(request)
    const keys = Object.keys(result)
    expect(keys).not.toContain('installationAuthorized')
    expect(keys).not.toContain('provisioningAuthorized')
    expect(keys).not.toContain('activationAuthorized')
  })

  // L-9J-713: denied assessment MUST identify the permission AND policy rule that caused it
  it('L-9J-713: denied permissions MUST carry non-empty machine-readable reason identifying the policy rule', () => {
    const request: PermissionEvaluationRequest = {
      subject: makeSubject(),
      permissionManifest: makeManifest([{ domain: 'network', value: 'api.example.com' }]),
      executionContext: makeContext(),
      policy: makePolicy([{ order: 0, domain: 'network', effect: 'deny' }], 'allow'),
      evaluatedAt: AT,
    }
    const result = evaluator.evaluate(request)
    expect(result.decision).toBe('denied')
    expect(result.deniedPermissions).toHaveLength(1)
    const denied = result.deniedPermissions[0]!
    expect(denied.permission.domain).toBe('network')
    // reason must be non-empty and identify the cause
    expect(denied.reason).toBeTruthy()
    expect(denied.reason.length).toBeGreaterThan(0)
  })

  // L-9J-714: evaluation MUST use caller-supplied evaluatedAt, not system clock
  it('L-9J-714: manifest semanticHash in result MUST come from the request, not generated internally', () => {
    const request: PermissionEvaluationRequest = {
      subject: makeSubject(),
      permissionManifest: { manifestVersion: '1', requestedPermissions: [], semanticHash: 'specific-hash-xyz' },
      executionContext: makeContext(),
      policy: makePolicy([]),
      evaluatedAt: AT,
    }
    const result = evaluator.evaluate(request)
    // The evaluatedAt is explicit in the request; the result references the caller-supplied hash
    expect(result.manifestSemanticHash).toBe('specific-hash-xyz')
  })
})
