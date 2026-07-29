import { describe, it, expect } from 'vitest'
import { ProvenanceRequestValidator } from '../provenance-request-validator.js'
import type { ProvenanceVerificationRequest, ProvenanceStatement, ProvenancePolicy } from '../types.js'
import type { PackageTrustSubject, IntegrityAssessment, ExternalSourceIdentity, IntegrityDigest } from '@rohinik-org/package-trust-ir'

const DIGEST: IntegrityDigest = { algorithm: 'sha256', encoding: 'hex', value: 'a'.repeat(64) }
const SOURCE: ExternalSourceIdentity = { sourceKind: 'npm-registry', registryId: 'r.example.com', artifactLocator: 'pkg/-/pkg-1.0.0.tgz' }
const SUBJECT: PackageTrustSubject = { subjectKind: 'language-dependency', packageId: 'pkg', version: '1.0.0', sourceIdentity: SOURCE, expectedIntegrity: DIGEST }
const GOOD_INTEGRITY: IntegrityAssessment = { passed: true, expectedIntegrity: DIGEST, observedIntegrity: DIGEST }
const BAD_INTEGRITY: IntegrityAssessment = { passed: false, expectedIntegrity: DIGEST, reason: 'integrity-mismatch' }

function makeStatement(): ProvenanceStatement {
  return {
    statementId: 'stmt-1',
    statementType: 'build-attestation',
    statementVersion: '1.0',
    subjects: [{ subjectId: 'sub-1', packageId: 'pkg', version: '1.0.0', digest: DIGEST }],
    predicateType: 'https://example.com/predicate/v1',
    issuedAt: new Date(Date.now() - 1000).toISOString(),
    materials: [],
    outputs: [],
    authorityIssuerId: 'issuer-1',
    envelope: { provenanceVersion: '1', issuerId: 'issuer-1', buildId: 'b1', outputIntegrity: DIGEST, builderIdentity: 'builder-1', builtAt: new Date().toISOString(), signature: 'sig' },
  }
}

function makePolicy(): ProvenancePolicy {
  return {
    provenanceRequired: true,
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
  }
}

function makeRequest(): ProvenanceVerificationRequest {
  return {
    subject: SUBJECT,
    integrityAssessment: GOOD_INTEGRITY,
    provenanceStatement: makeStatement(),
    policy: makePolicy(),
    evaluatedAt: new Date(Date.now() - 1000).toISOString(),
  }
}

const v = new ProvenanceRequestValidator()

describe('ProvenanceRequestValidator', () => {
  it('valid complete request passes', () => {
    expect(v.validate(makeRequest()).valid).toBe(true)
  })

  it('missing subject fails', () => {
    const r = v.validate({ ...makeRequest(), subject: undefined as unknown as PackageTrustSubject })
    expect(r.valid).toBe(false)
  })

  it('failed integrity assessment fails', () => {
    const r = v.validate({ ...makeRequest(), integrityAssessment: BAD_INTEGRITY })
    expect(r.valid).toBe(false)
  })

  it('missing provenance statement fails', () => {
    const r = v.validate({ ...makeRequest(), provenanceStatement: undefined as unknown as ProvenanceStatement })
    expect(r.valid).toBe(false)
  })

  it('malformed statement type fails', () => {
    const stmt = { ...makeStatement(), statementType: '' }
    const r = v.validate({ ...makeRequest(), provenanceStatement: stmt })
    expect(r.valid).toBe(false)
    expect(r.reason).toBe('malformed-provenance')
  })

  it('malformed evaluation time fails', () => {
    const r = v.validate({ ...makeRequest(), evaluatedAt: 'not-a-date' })
    expect(r.valid).toBe(false)
  })

  it('malformed policy fails', () => {
    const badPolicy = { ...makePolicy(), acceptedStatementTypes: undefined as unknown as string[] }
    const r = v.validate({ ...makeRequest(), policy: badPolicy })
    expect(r.valid).toBe(false)
  })
})
