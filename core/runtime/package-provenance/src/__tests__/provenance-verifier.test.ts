import { describe, it, expect } from 'vitest'
import { ProvenanceVerifier } from '../provenance-verifier.js'
import type { ProvenanceVerificationRequest, ProvenanceStatement, ProvenancePolicy } from '../types.js'
import type { PackageTrustSubject, IntegrityAssessment, ExternalSourceIdentity, IntegrityDigest, RevocationAssessment } from '@rohinik-org/package-trust-ir'

const DIGEST: IntegrityDigest = { algorithm: 'sha256', encoding: 'hex', value: 'a'.repeat(64) }
const OTHER_DIGEST: IntegrityDigest = { algorithm: 'sha256', encoding: 'hex', value: 'b'.repeat(64) }
const SOURCE: ExternalSourceIdentity = { sourceKind: 'npm-registry', registryId: 'r.example.com', artifactLocator: 'pkg/-/pkg-1.0.0.tgz' }
const SUBJECT: PackageTrustSubject = { subjectKind: 'language-dependency', packageId: 'pkg', version: '1.0.0', sourceIdentity: SOURCE, expectedIntegrity: DIGEST }
const GOOD_INTEGRITY: IntegrityAssessment = { passed: true, expectedIntegrity: DIGEST, observedIntegrity: DIGEST }
const NOW = new Date(Date.now() - 1000).toISOString()

function makeStatement(overrides?: Partial<ProvenanceStatement>): ProvenanceStatement {
  return {
    statementId: 'stmt-1',
    statementType: 'build-attestation',
    statementVersion: '1.0',
    subjects: [{ subjectId: 'sub-1', packageId: 'pkg', version: '1.0.0', digest: DIGEST }],
    predicateType: 'predicate/v1',
    issuedAt: new Date(Date.now() - 5000).toISOString(),
    materials: [{ materialId: 'mat-1', kind: 'source-tree', uri: 'https://github.com/acme/pkg' }],
    outputs: [{ outputId: 'out-1', packageId: 'pkg', version: '1.0.0', digest: DIGEST }],
    authorityIssuerId: 'trusted-issuer',
    sourceIdentity: { authority: 'github.com', repository: 'acme/pkg', revision: { kind: 'commit-sha', value: 'a'.repeat(40) } },
    builderIdentity: { kind: 'ci-system', builderId: 'github-actions', workflowId: 'release.yml' },
    envelope: { provenanceVersion: '1', issuerId: 'trusted-issuer', buildId: 'b1', outputIntegrity: DIGEST, builderIdentity: 'github-actions', builtAt: NOW, signature: 'sig' },
    ...overrides,
  }
}

function makePolicy(overrides?: Partial<ProvenancePolicy>): ProvenancePolicy {
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
    ...overrides,
  }
}

function baseRequest(): ProvenanceVerificationRequest {
  return {
    subject: SUBJECT,
    integrityAssessment: GOOD_INTEGRITY,
    provenanceStatement: makeStatement(),
    policy: makePolicy(),
    evaluatedAt: NOW,
  }
}

const verifier = new ProvenanceVerifier()

describe('ProvenanceVerifier', () => {
  it('valid complete request produces verified result', () => {
    const r = verifier.verify(baseRequest())
    expect(r.passed).toBe(true)
    expect(r.outcome).toBe('verified')
  })

  it('missing integrity assessment fails', () => {
    const r = verifier.verify({ ...baseRequest(), integrityAssessment: undefined as unknown as IntegrityAssessment })
    expect(r.passed).toBe(false)
  })

  it('failed integrity assessment fails', () => {
    const r = verifier.verify({ ...baseRequest(), integrityAssessment: { passed: false, expectedIntegrity: DIGEST, reason: 'integrity-mismatch' } })
    expect(r.passed).toBe(false)
  })

  it('missing provenance statement fails', () => {
    const r = verifier.verify({ ...baseRequest(), provenanceStatement: undefined as unknown as ProvenanceStatement })
    expect(r.passed).toBe(false)
  })

  it('malformed statement fails', () => {
    const r = verifier.verify({ ...baseRequest(), provenanceStatement: makeStatement({ statementType: '' }) })
    expect(r.passed).toBe(false)
    expect(r.outcome).toBe('malformed-provenance')
  })

  it('artifact digest mismatch fails', () => {
    const stmt = makeStatement({
      subjects: [{ subjectId: 'sub-1', digest: OTHER_DIGEST }],
      outputs: [{ outputId: 'out-1', digest: OTHER_DIGEST }],
    })
    const r = verifier.verify({ ...baseRequest(), provenanceStatement: stmt })
    expect(r.passed).toBe(false)
    expect(r.outcome).toBe('artifact-digest-mismatch')
  })

  it('mutable source revision rejected when policy requires immutable', () => {
    const stmt = makeStatement({ sourceIdentity: { authority: 'github.com', repository: 'acme/pkg', revision: { kind: 'branch', value: 'main' } } })
    const r = verifier.verify({ ...baseRequest(), provenanceStatement: stmt, policy: makePolicy({ requireImmutableSourceRevision: true }) })
    expect(r.passed).toBe(false)
  })

  it('revoked builder fails', () => {
    const revoked: RevocationAssessment = { decision: 'failed', reason: 'builder-revoked' }
    const r = verifier.verify({ ...baseRequest(), revocationAssessment: revoked })
    expect(r.passed).toBe(false)
    expect(r.outcome).toBe('builder-revoked')
  })

  it('missing required material fails', () => {
    const stmt = makeStatement({ materials: [] })
    const r = verifier.verify({ ...baseRequest(), provenanceStatement: stmt, policy: makePolicy({ requiredMaterialKinds: ['lockfile'] }) })
    expect(r.passed).toBe(false)
    expect(r.outcome).toBe('input-set-incomplete')
  })

  it('output mismatch fails', () => {
    const stmt = makeStatement({ outputs: [{ outputId: 'out-1', digest: OTHER_DIGEST }] })
    const r = verifier.verify({ ...baseRequest(), provenanceStatement: stmt, policy: makePolicy() })
    expect(r.passed).toBe(false)
  })

  it('policy violated fails with policy-unsatisfied', () => {
    const r = verifier.verify({ ...baseRequest(), policy: makePolicy({ acceptedStatementTypes: ['other-type'] }) })
    expect(r.passed).toBe(false)
    expect(r.outcome).toBe('policy-unsatisfied')
  })

  it('degraded provenance produces verified-degraded', () => {
    const r = verifier.verify({
      ...baseRequest(),
      policy: makePolicy({ requireReproducibleBuild: true, allowDegradedProvenance: true }),
    })
    expect(r.passed).toBe(true)
    expect(r.outcome).toBe('verified-degraded')
    expect(r.degradationReasons).toBeDefined()
  })

  it('expired statement fails', () => {
    const stmt = makeStatement({ notAfter: new Date(Date.now() - 3600_000).toISOString() })
    const r = verifier.verify({ ...baseRequest(), provenanceStatement: stmt })
    expect(r.passed).toBe(false)
    expect(r.outcome).toBe('evidence-expired')
  })

  it('ambiguous provenance (multiple subjects same digest) fails', () => {
    const stmt = makeStatement({
      subjects: [
        { subjectId: 'sub-1', digest: DIGEST },
        { subjectId: 'sub-2', digest: DIGEST },
      ],
    })
    const r = verifier.verify({ ...baseRequest(), provenanceStatement: stmt })
    expect(r.passed).toBe(false)
    expect(r.outcome).toBe('ambiguous-provenance')
  })

  it('no final trust decision returned', () => {
    const r = verifier.verify(baseRequest())
    expect(r).not.toHaveProperty('decision')
    expect(r).not.toHaveProperty('trustDecision')
  })

  it('no provisioning or quarantine action', () => {
    const r = verifier.verify(baseRequest())
    expect(r).not.toHaveProperty('provisioningToken')
    expect(r).not.toHaveProperty('quarantineId')
  })

  it('assessment is immutable (frozen)', () => {
    const r = verifier.verify(baseRequest())
    expect(Object.isFrozen(r)).toBe(true)
  })

  it('evidence ordering deterministic — repeated evaluation same result', () => {
    const r1 = verifier.verify(baseRequest())
    const r2 = verifier.verify(baseRequest())
    expect(r1.outcome).toBe(r2.outcome)
    expect(r1.passed).toBe(r2.passed)
    if (r1.materialEvidenceIds && r2.materialEvidenceIds) {
      expect(r1.materialEvidenceIds).toEqual(r2.materialEvidenceIds)
    }
  })
})
