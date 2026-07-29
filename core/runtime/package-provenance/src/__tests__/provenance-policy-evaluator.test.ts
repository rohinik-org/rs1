import { describe, it, expect } from 'vitest'
import { ProvenancePolicyEvaluator } from '../provenance-policy-evaluator.js'
import type { ProvenanceStatement, ProvenancePolicy } from '../types.js'
import type { IntegrityDigest } from '@rohinik-org/package-trust-ir'

const DIGEST: IntegrityDigest = { algorithm: 'sha256', encoding: 'hex', value: 'a'.repeat(64) }
const NOW = new Date(Date.now() - 1000).toISOString()

function makeStatement(overrides?: Partial<ProvenanceStatement>): ProvenanceStatement {
  return {
    statementId: 'stmt-1',
    statementType: 'build-attestation',
    statementVersion: '1.0',
    subjects: [{ subjectId: 'sub-1', digest: DIGEST }],
    predicateType: 'predicate/v1',
    issuedAt: new Date(Date.now() - 5000).toISOString(),
    materials: [],
    outputs: [],
    authorityIssuerId: 'trusted-issuer',
    envelope: { provenanceVersion: '1', issuerId: 'trusted-issuer', buildId: 'b1', outputIntegrity: DIGEST, builderIdentity: 'builder-1', builtAt: NOW, signature: 'sig' },
    ...overrides,
  }
}

function makePolicy(overrides?: Partial<ProvenancePolicy>): ProvenancePolicy {
  return {
    provenanceRequired: false,
    acceptedStatementTypes: [],
    acceptedStatementVersions: [],
    requiredBuilderIds: [],
    requiredWorkflowIds: [],
    requireImmutableSourceRevision: false,
    requireSourceTreeDigest: false,
    requiredMaterialKinds: [],
    requireCompleteInputSet: false,
    requireOutputDigestBinding: false,
    requireReproducibleBuild: false,
    trustedAuthorityIds: [],
    allowDegradedProvenance: false,
    ...overrides,
  }
}

const ev = new ProvenancePolicyEvaluator()

describe('ProvenancePolicyEvaluator', () => {
  it('provenance optional — no violations with empty policy', () => {
    const r = ev.evaluate(makeStatement(), makePolicy(), NOW, true, true, true, true)
    expect(r.satisfied).toBe(true)
    expect(r.violations).toHaveLength(0)
  })

  it('accepted statement type passes', () => {
    const r = ev.evaluate(makeStatement(), makePolicy({ acceptedStatementTypes: ['build-attestation'] }), NOW, true, true, true, true)
    expect(r.satisfied).toBe(true)
  })

  it('rejected statement type fails', () => {
    const r = ev.evaluate(makeStatement(), makePolicy({ acceptedStatementTypes: ['source-attestation'] }), NOW, true, true, true, true)
    expect(r.satisfied).toBe(false)
    expect(r.violations.some(v => v.code === 'unsupported-statement-type')).toBe(true)
  })

  it('required builder failure propagates', () => {
    const r = ev.evaluate(makeStatement(), makePolicy(), NOW, false, true, true, true)
    expect(r.satisfied).toBe(false)
  })

  it('required workflow failure propagates', () => {
    const r = ev.evaluate(makeStatement(), makePolicy(), NOW, false, true, true, true)
    expect(r.satisfied).toBe(false)
  })

  it('required immutable source failure propagates', () => {
    const r = ev.evaluate(makeStatement(), makePolicy(), NOW, true, false, true, true)
    expect(r.satisfied).toBe(false)
  })

  it('required complete inputs failure propagates', () => {
    const r = ev.evaluate(makeStatement(), makePolicy(), NOW, true, true, false, true)
    expect(r.satisfied).toBe(false)
  })

  it('required reproducibility produces degradation not failure with degraded allowed', () => {
    const r = ev.evaluate(makeStatement(), makePolicy({ requireReproducibleBuild: true, allowDegradedProvenance: true }), NOW, true, true, true, true)
    expect(r.satisfied).toBe(true)
    expect(r.degraded).toBe(true)
  })

  it('required reproducibility fails when degraded not allowed', () => {
    const r = ev.evaluate(makeStatement(), makePolicy({ requireReproducibleBuild: true, allowDegradedProvenance: false }), NOW, true, true, true, true)
    expect(r.satisfied).toBe(false)
  })

  it('maximum provenance age exceeded fails', () => {
    const oldStmt = makeStatement({ issuedAt: new Date(Date.now() - 100_000).toISOString() })
    const r = ev.evaluate(oldStmt, makePolicy({ maxProvenanceAgeSeconds: 60 }), NOW, true, true, true, true)
    expect(r.satisfied).toBe(false)
    expect(r.violations.some(v => v.code === 'evidence-expired')).toBe(true)
  })

  it('expired statement fails', () => {
    const expiredStmt = makeStatement({ notAfter: new Date(Date.now() - 3600_000).toISOString() })
    const r = ev.evaluate(expiredStmt, makePolicy(), NOW, true, true, true, true)
    expect(r.satisfied).toBe(false)
  })

  it('not-yet-valid statement fails', () => {
    const futureStmt = makeStatement({ notBefore: new Date(Date.now() + 3600_000).toISOString() })
    const r = ev.evaluate(futureStmt, makePolicy(), NOW, true, true, true, true)
    expect(r.satisfied).toBe(false)
  })

  it('trusted authority passes', () => {
    const r = ev.evaluate(makeStatement(), makePolicy({ trustedAuthorityIds: ['trusted-issuer'] }), NOW, true, true, true, true)
    expect(r.satisfied).toBe(true)
  })

  it('untrusted authority fails', () => {
    const r = ev.evaluate(makeStatement(), makePolicy({ trustedAuthorityIds: ['other-issuer'] }), NOW, true, true, true, true)
    expect(r.satisfied).toBe(false)
  })

  it('multiple violations ordered deterministically', () => {
    const r1 = ev.evaluate(
      makeStatement({ statementType: 'wrong-type', notAfter: new Date(Date.now() - 1000).toISOString() }),
      makePolicy({ acceptedStatementTypes: ['build-attestation'], trustedAuthorityIds: ['other-issuer'] }),
      NOW, false, false, false, false,
    )
    const r2 = ev.evaluate(
      makeStatement({ statementType: 'wrong-type', notAfter: new Date(Date.now() - 1000).toISOString() }),
      makePolicy({ acceptedStatementTypes: ['build-attestation'], trustedAuthorityIds: ['other-issuer'] }),
      NOW, false, false, false, false,
    )
    expect(r1.violations.map(v => v.code)).toEqual(r2.violations.map(v => v.code))
  })
})
