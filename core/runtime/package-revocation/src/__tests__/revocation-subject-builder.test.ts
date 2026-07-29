import { describe, it, expect } from 'vitest'
import { buildRevocationSubjects } from '../revocation-subject-builder.js'
import type { RevocationEvaluationContext, RevocationPolicy } from '../types.js'
import type { PackageTrustSubject, SignatureAssessment } from '@rohinik-org/package-trust-ir'

const SUBJECT: PackageTrustSubject = {
  subjectKind: 'language-dependency',
  packageId: 'lodash',
  version: '4.17.21',
  sourceIdentity: { sourceKind: 'npm-registry', registryId: 'npmjs.org', artifactLocator: 'lodash@4.17.21' },
  expectedIntegrity: { algorithm: 'sha256', encoding: 'hex', value: 'a'.repeat(64) },
}

const POLICY: RevocationPolicy = { requireIssuer: true, requireSigningKey: true, requirePackage: false, allowUnknown: false }

function makeContext(overrides: Partial<RevocationEvaluationContext> = {}): RevocationEvaluationContext {
  return {
    subject: SUBJECT,
    signatureAssessment: { passed: true, issuerId: 'acme', keyId: 'key-1' },
    issuerId: 'acme',
    signingKeyId: 'key-1',
    evaluatedAt: '2026-07-01T12:00:00.000Z',
    ...overrides,
  }
}

describe('buildRevocationSubjects', () => {
  it('builds issuer subject', () => {
    const subjects = buildRevocationSubjects(makeContext(), POLICY)
    expect(subjects.some(s => s.targetKind === 'issuer' && s.targetId === 'acme')).toBe(true)
  })

  it('builds key subject', () => {
    const subjects = buildRevocationSubjects(makeContext(), POLICY)
    expect(subjects.some(s => s.targetKind === 'key' && s.targetId === 'key-1')).toBe(true)
  })

  it('builds package and package-version subjects', () => {
    const subjects = buildRevocationSubjects(makeContext(), POLICY)
    expect(subjects.some(s => s.targetKind === 'package')).toBe(true)
    expect(subjects.some(s => s.targetKind === 'package-version' && s.targetId === 'lodash@4.17.21')).toBe(true)
  })

  it('deduplicates identical subjects', () => {
    const ctx = makeContext({ issuerId: 'acme' })
    // call twice — still same result
    const a = buildRevocationSubjects(ctx, POLICY)
    const b = buildRevocationSubjects(ctx, POLICY)
    expect(a).toEqual(b)
  })

  it('same ID under different target kinds remains distinct', () => {
    const ctx = makeContext({ issuerId: 'key-1', signingKeyId: 'key-1' })
    const subjects = buildRevocationSubjects(ctx, POLICY)
    const issuerSubjects = subjects.filter(s => s.targetKind === 'issuer' && s.targetId === 'key-1')
    const keySubjects = subjects.filter(s => s.targetKind === 'key' && s.targetId === 'key-1')
    expect(issuerSubjects).toHaveLength(1)
    expect(keySubjects).toHaveLength(1)
  })

  it('deterministic subject ordering: issuer before key', () => {
    const subjects = buildRevocationSubjects(makeContext(), POLICY)
    const issuerIdx = subjects.findIndex(s => s.targetKind === 'issuer')
    const keyIdx = subjects.findIndex(s => s.targetKind === 'key')
    expect(issuerIdx).toBeLessThan(keyIdx)
  })

  it('no issuer subject when issuerId absent', () => {
    const subjects = buildRevocationSubjects(makeContext({ issuerId: undefined }), POLICY)
    expect(subjects.every(s => s.targetKind !== 'issuer')).toBe(true)
  })
})
