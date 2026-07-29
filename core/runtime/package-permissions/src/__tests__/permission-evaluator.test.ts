import { describe, it, expect } from 'vitest'
import { PermissionEvaluator } from '../permission-evaluator.js'
import type { PermissionEvaluationRequest, PermissionPolicy, PermissionExecutionContext } from '../types.js'
import type { CanonicalPermission, PackagePermissionManifest, PackageTrustSubject } from '@rohinik-org/package-trust-ir'

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
  return { manifestVersion: '1', requestedPermissions: permissions, semanticHash: 'hash-1' }
}

function makeContext(): PermissionExecutionContext {
  return { hostEnvironment: 'test' }
}

function makePolicy(rules: PermissionPolicy['rules'], defaultEffect: 'allow' | 'deny' = 'deny'): PermissionPolicy {
  return { rules, defaultEffect, enforcementCapabilities: [] }
}

const evaluator = new PermissionEvaluator()
const AT = '2026-07-29T12:00:00.000Z'

describe('permission-evaluator (orchestrator)', () => {
  it('golden path: all permissions allowed', () => {
    const request: PermissionEvaluationRequest = {
      subject: makeSubject(),
      permissionManifest: makeManifest([{ domain: 'filesystem', value: '/tmp', resourceConstraint: 'read' }]),
      executionContext: makeContext(),
      policy: makePolicy([{ order: 0, domain: 'filesystem', effect: 'allow' }]),
      evaluatedAt: AT,
    }
    const result = evaluator.evaluate(request)
    expect(result.decision).toBe('granted')
    expect(result.grantedPermissions).toHaveLength(1)
    expect(result.deniedPermissions).toHaveLength(0)
  })

  it('denied when policy denies all permissions', () => {
    const request: PermissionEvaluationRequest = {
      subject: makeSubject(),
      permissionManifest: makeManifest([{ domain: 'filesystem', value: '/tmp', resourceConstraint: 'read' }]),
      executionContext: makeContext(),
      policy: makePolicy([{ order: 0, domain: 'filesystem', effect: 'deny' }]),
      evaluatedAt: AT,
    }
    const result = evaluator.evaluate(request)
    expect(result.decision).toBe('denied')
    expect(result.deniedPermissions).toHaveLength(1)
  })

  it('conditionally-granted when policy uses conditional effect', () => {
    const request: PermissionEvaluationRequest = {
      subject: makeSubject(),
      permissionManifest: makeManifest([{ domain: 'filesystem', value: '/tmp', resourceConstraint: 'read' }]),
      executionContext: makeContext(),
      policy: makePolicy([{ order: 0, domain: 'filesystem', effect: 'conditional', conditionId: 'audit-required' }]),
      evaluatedAt: AT,
    }
    const result = evaluator.evaluate(request)
    expect(result.decision).toBe('conditionally-granted')
    expect(result.grantedPermissions[0]!.conditionId).toBe('audit-required')
  })

  it('returns denied for invalid request', () => {
    const result = evaluator.evaluate(null as unknown as PermissionEvaluationRequest)
    expect(result.decision).toBe('denied')
  })

  it('returns denied for invalid evaluatedAt', () => {
    const request = {
      subject: makeSubject(),
      permissionManifest: makeManifest([]),
      executionContext: makeContext(),
      policy: makePolicy([]),
      evaluatedAt: 'not-a-date',
    } as unknown as PermissionEvaluationRequest
    const result = evaluator.evaluate(request)
    expect(result.decision).toBe('denied')
  })

  it('sets manifestSemanticHash on result', () => {
    const request: PermissionEvaluationRequest = {
      subject: makeSubject(),
      permissionManifest: makeManifest([]),
      executionContext: makeContext(),
      policy: makePolicy([]),
      evaluatedAt: AT,
    }
    const result = evaluator.evaluate(request)
    expect(result.manifestSemanticHash).toBe('hash-1')
  })

  it('scope violation causes denied decision', () => {
    const request: PermissionEvaluationRequest = {
      subject: makeSubject(),
      permissionManifest: makeManifest([{ domain: 'filesystem', value: '../escape' }]),
      executionContext: makeContext(),
      policy: makePolicy([{ order: 0, domain: 'filesystem', effect: 'allow' }]),
      evaluatedAt: AT,
    }
    const result = evaluator.evaluate(request)
    expect(result.decision).toBe('denied')
  })

  it('empty permission manifest with deny-default → granted (nothing to deny)', () => {
    const request: PermissionEvaluationRequest = {
      subject: makeSubject(),
      permissionManifest: makeManifest([]),
      executionContext: makeContext(),
      policy: makePolicy([]),
      evaluatedAt: AT,
    }
    const result = evaluator.evaluate(request)
    expect(result.decision).toBe('granted')
    expect(result.grantedPermissions).toHaveLength(0)
    expect(result.deniedPermissions).toHaveLength(0)
  })

  it('expansion finding causes denied decision', () => {
    const request: PermissionEvaluationRequest = {
      subject: makeSubject(),
      permissionManifest: makeManifest([{ domain: 'filesystem', value: '/etc/passwd', resourceConstraint: 'read' }]),
      executionContext: { filesystemRoots: ['/app'] },
      policy: makePolicy([{ order: 0, domain: 'filesystem', effect: 'allow' }]),
      evaluatedAt: AT,
    }
    const result = evaluator.evaluate(request)
    expect(result.decision).toBe('denied')
  })
})
