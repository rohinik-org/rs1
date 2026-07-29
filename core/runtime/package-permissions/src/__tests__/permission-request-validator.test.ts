import { describe, it, expect } from 'vitest'
import { validatePermissionEvaluationRequest } from '../permission-request-validator.js'
import type { PermissionEvaluationRequest } from '../types.js'
import type { PackageTrustSubject } from '@rohinik-org/package-trust-ir'

function makeSubject(): PackageTrustSubject {
  return {
    subjectKind: 'rohinik-package',
    packageId: 'test-pkg',
    version: '1.0.0',
    sourceIdentity: { sourceKind: 'workspace', workspaceId: 'ws1', artifactId: 'art1' },
    expectedIntegrity: { algorithm: 'sha256', encoding: 'hex', value: 'abc123' },
  }
}

function makeValidRequest(): PermissionEvaluationRequest {
  return {
    subject: makeSubject(),
    permissionManifest: { manifestVersion: '1', requestedPermissions: [], semanticHash: 'h1' },
    executionContext: {},
    policy: { rules: [], defaultEffect: 'deny', enforcementCapabilities: [] },
    evaluatedAt: '2026-07-29T12:00:00.000Z',
  }
}

describe('permission-request-validator', () => {
  it('validates a correct request', () => {
    expect(validatePermissionEvaluationRequest(makeValidRequest()).valid).toBe(true)
  })

  it('rejects null', () => {
    const r = validatePermissionEvaluationRequest(null)
    expect(r.valid).toBe(false)
  })

  it('rejects missing subject', () => {
    const req = { ...makeValidRequest(), subject: undefined }
    expect(validatePermissionEvaluationRequest(req).valid).toBe(false)
  })

  it('rejects missing permissionManifest', () => {
    const req = { ...makeValidRequest(), permissionManifest: undefined }
    expect(validatePermissionEvaluationRequest(req).valid).toBe(false)
  })

  it('rejects missing executionContext', () => {
    const req = { ...makeValidRequest(), executionContext: undefined }
    expect(validatePermissionEvaluationRequest(req).valid).toBe(false)
  })

  it('rejects missing policy', () => {
    const req = { ...makeValidRequest(), policy: undefined }
    expect(validatePermissionEvaluationRequest(req).valid).toBe(false)
  })

  it('rejects policy with non-array rules', () => {
    const req = { ...makeValidRequest(), policy: { rules: 'bad', defaultEffect: 'deny', enforcementCapabilities: [] } }
    expect(validatePermissionEvaluationRequest(req).valid).toBe(false)
  })

  it('rejects invalid evaluatedAt — not ISO 8601', () => {
    const req = { ...makeValidRequest(), evaluatedAt: '2026-07-29' }
    expect(validatePermissionEvaluationRequest(req).valid).toBe(false)
  })

  it('rejects evaluatedAt with bad format', () => {
    const req = { ...makeValidRequest(), evaluatedAt: 'not-a-date' }
    expect(validatePermissionEvaluationRequest(req).valid).toBe(false)
  })
})
