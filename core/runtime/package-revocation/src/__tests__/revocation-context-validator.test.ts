import { describe, it, expect } from 'vitest'
import { validateRevocationContext } from '../revocation-context-validator.js'
import type { RevocationEvaluationContext, RevocationPolicy } from '../types.js'
import type { PackageTrustSubject, SignatureAssessment } from '@rohinik-org/package-trust-ir'

const SUBJECT: PackageTrustSubject = {
  subjectKind: 'language-dependency',
  packageId: 'lodash',
  version: '4.17.21',
  sourceIdentity: { sourceKind: 'npm-registry', registryId: 'npmjs.org', artifactLocator: 'lodash@4.17.21' },
  expectedIntegrity: { algorithm: 'sha256', encoding: 'hex', value: 'a'.repeat(64) },
}

const PASSED_SIG: SignatureAssessment = { passed: true, issuerId: 'acme', keyId: 'key-1' }
const FAILED_SIG: SignatureAssessment = { passed: false, reason: 'sig-invalid' }

const STRICT_POLICY: RevocationPolicy = {
  requireIssuer: true,
  requireSigningKey: true,
  requirePackage: false,
  allowUnknown: false,
}

const PERMISSIVE_POLICY: RevocationPolicy = {
  requireIssuer: false,
  requireSigningKey: false,
  requirePackage: false,
  allowUnknown: true,
}

function makeContext(overrides: Partial<RevocationEvaluationContext> = {}): RevocationEvaluationContext {
  return {
    subject: SUBJECT,
    signatureAssessment: PASSED_SIG,
    issuerId: 'acme',
    signingKeyId: 'key-1',
    evaluatedAt: '2026-07-01T12:00:00.000Z',
    ...overrides,
  }
}

describe('validateRevocationContext', () => {
  it('complete context succeeds', () => {
    expect(validateRevocationContext(makeContext(), STRICT_POLICY).valid).toBe(true)
  })

  it('malformed evaluatedAt fails', () => {
    const result = validateRevocationContext(makeContext({ evaluatedAt: 'not-a-date' }), STRICT_POLICY)
    expect(result.valid).toBe(false)
    expect((result as any).reason).toMatch(/evaluatedAt/)
  })

  it('missing issuerId when required fails', () => {
    const result = validateRevocationContext(makeContext({ issuerId: undefined } as unknown as Partial<RevocationEvaluationContext>), STRICT_POLICY)
    expect(result.valid).toBe(false)
    expect((result as any).reason).toMatch(/issuer/)
  })

  it('missing signingKeyId when required fails', () => {
    const result = validateRevocationContext(makeContext({ signingKeyId: undefined } as unknown as Partial<RevocationEvaluationContext>), STRICT_POLICY)
    expect(result.valid).toBe(false)
    expect((result as any).reason).toMatch(/key/)
  })

  it('permissive policy accepts missing identifiers', () => {
    const result = validateRevocationContext(
      makeContext({ issuerId: undefined, signingKeyId: undefined } as unknown as Partial<RevocationEvaluationContext>),
      PERMISSIVE_POLICY,
    )
    expect(result.valid).toBe(true)
  })

  it('empty string issuerId fails', () => {
    const result = validateRevocationContext(makeContext({ issuerId: '' }), PERMISSIVE_POLICY)
    expect(result.valid).toBe(false)
    expect((result as any).reason).toMatch(/empty/)
  })
})
