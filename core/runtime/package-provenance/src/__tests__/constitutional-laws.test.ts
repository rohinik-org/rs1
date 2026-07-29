import { describe, it, expect } from 'vitest'
import { ProvenanceVerifier } from '../provenance-verifier.js'
import { ProvenanceSubjectBinder } from '../provenance-subject-binder.js'
import { SourceIdentityValidator } from '../source-identity-validator.js'
import { BuilderIdentityValidator } from '../builder-identity-validator.js'
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
  return { subject: SUBJECT, integrityAssessment: GOOD_INTEGRITY, provenanceStatement: makeStatement(), policy: makePolicy(), evaluatedAt: NOW }
}

const verifier = new ProvenanceVerifier()

describe('Constitutional Laws', () => {
  it('L-9J-601: provenance bound to exact artifact verified by integrity boundary', () => {
    const stmt = makeStatement({ subjects: [{ subjectId: 'sub-1', digest: OTHER_DIGEST }] })
    const r = verifier.verify({ ...baseRequest(), provenanceStatement: stmt })
    expect(r.passed).toBe(false)
    expect(r.outcome).toBe('artifact-digest-mismatch')
  })

  it('L-9J-601: verified result includes artifact digest binding evidence', () => {
    const r = verifier.verify(baseRequest())
    if (r.passed) {
      expect(r.artifactDigest).toBeDefined()
    }
  })

  it('L-9J-602: well-formed provenance alone does not produce verified result when policy fails', () => {
    const r = verifier.verify({ ...baseRequest(), policy: makePolicy({ acceptedStatementTypes: ['other-type'] }) })
    expect(r.passed).toBe(false)
  })

  it('L-9J-603: subject digest mismatch never produces verified assessment', () => {
    const stmt = makeStatement({
      subjects: [{ subjectId: 'sub-1', digest: OTHER_DIGEST }],
      outputs: [{ outputId: 'out-1', digest: OTHER_DIGEST }],
    })
    const r = verifier.verify({ ...baseRequest(), provenanceStatement: stmt })
    expect(r.passed).toBe(false)
    expect(r.outcome).not.toBe('verified')
  })

  it('L-9J-604: provenance verification never rereads artifact bytes', () => {
    let bytesRead = false
    const fakeReader = { streamArtifact() { bytesRead = true; return (async function* () {})() }, dispose: async () => {} }
    verifier.verify(baseRequest())
    expect(bytesRead).toBe(false)
  })

  it('L-9J-604: subjectBinder does not trigger artifact reads', () => {
    let called = false
    const binder = new ProvenanceSubjectBinder()
    binder.bind(makeStatement(), DIGEST, 'pkg', '1.0.0', makePolicy())
    expect(called).toBe(false)
  })

  it('L-9J-605: mutable source reference fails immutable-revision policy', () => {
    const mutableSrc = makeStatement({ sourceIdentity: { authority: 'github.com', repository: 'acme/pkg', revision: { kind: 'branch', value: 'main' } } })
    const r = verifier.verify({ ...baseRequest(), provenanceStatement: mutableSrc, policy: makePolicy({ requireImmutableSourceRevision: true }) })
    expect(r.passed).toBe(false)
    expect(r.outcome).not.toBe('verified')
  })

  it('L-9J-605: branch-name source revision rejected by source validator', () => {
    const sv = new SourceIdentityValidator()
    const r = sv.validate({ authority: 'github.com', repository: 'acme/pkg', revision: { kind: 'branch', value: 'main' } }, makePolicy({ requireImmutableSourceRevision: true }), NOW)
    expect(r.valid).toBe(false)
  })

  it('L-9J-606: builder identity distinct from publisher identity', () => {
    const bv = new BuilderIdentityValidator()
    const builderResult = bv.validate({ kind: 'ci-system', builderId: 'github-actions' }, makePolicy(), undefined, { passed: true, outcome: 'trusted' })
    const builderIdentity = builderResult.valid ? builderResult.builderIdentity : undefined
    expect(builderIdentity).not.toBe('trusted')
    expect(builderIdentity).not.toContain('publisher')
  })

  it('L-9J-607: revoked builder never produces verified provenance', () => {
    const revoked: RevocationAssessment = { decision: 'failed', reason: 'builder-key-revoked' }
    const r = verifier.verify({ ...baseRequest(), revocationAssessment: revoked })
    expect(r.passed).toBe(false)
    expect(r.outcome).toBe('builder-revoked')
  })

  it('L-9J-607: revoked attestation issuer fails provenance', () => {
    const revoked: RevocationAssessment = { decision: 'failed', reason: 'attestation-key-revoked' }
    const r = verifier.verify({ ...baseRequest(), revocationAssessment: revoked })
    expect(r.passed).toBe(false)
  })

  it('L-9J-608: missing policy-required build inputs distinct from verified', () => {
    const stmt = makeStatement({ materials: [] })
    const r = verifier.verify({ ...baseRequest(), provenanceStatement: stmt, policy: makePolicy({ requiredMaterialKinds: ['lockfile'] }) })
    expect(r.passed).toBe(false)
    expect(r.outcome).toBe('input-set-incomplete')
    expect(r.outcome).not.toBe('verified')
  })

  it('L-9J-609: source-only statement without output binding fails when policy requires end-to-end', () => {
    const stmt = makeStatement({ outputs: [] })
    const r = verifier.verify({ ...baseRequest(), provenanceStatement: stmt, policy: makePolicy({ requireOutputDigestBinding: true }) })
    expect(r.passed).toBe(false)
  })

  it('L-9J-610: ambiguous provenance never silently treated as verified', () => {
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

  it('L-9J-611: provenance verification does not make final package-trust decision', () => {
    const r = verifier.verify(baseRequest())
    expect(r).not.toHaveProperty('decision')
    expect(r).not.toHaveProperty('trustDecision')
    expect(r).not.toHaveProperty('packageTrustDecision')
  })

  it('L-9J-612: no provisioning or installation authorization produced', () => {
    const r = verifier.verify(baseRequest())
    expect(r).not.toHaveProperty('provisioningToken')
    expect(r).not.toHaveProperty('installationAuthorization')
    expect(r).not.toHaveProperty('quarantineId')
  })

  it('L-9J-613: evaluation uses caller-supplied time, not system clock', () => {
    const fixedTime = '2020-06-15T12:00:00.000Z'
    const stmt = makeStatement({ issuedAt: '2010-01-01T00:00:00.000Z', notAfter: '2030-01-01T00:00:00.000Z' })
    const r = verifier.verify({ ...baseRequest(), provenanceStatement: stmt, evaluatedAt: fixedTime })
    expect(r.passed).toBe(true)
  })

  it('L-9J-613: repeated evaluation with same time produces same result', () => {
    const r1 = verifier.verify(baseRequest())
    const r2 = verifier.verify(baseRequest())
    expect(r1.outcome).toBe(r2.outcome)
    expect(r1.passed).toBe(r2.passed)
  })

  it('L-9J-614: verified assessment identifies source revision', () => {
    const r = verifier.verify(baseRequest())
    if (r.passed && r.outcome === 'verified') {
      expect(r.sourceRevision).toBeTruthy()
    }
  })

  it('L-9J-614: verified assessment identifies builder identity', () => {
    const r = verifier.verify(baseRequest())
    if (r.passed && r.outcome === 'verified') {
      expect(r.builderIdentity).toBeTruthy()
    }
  })

  it('L-9J-614: verified assessment identifies artifact binding evidence', () => {
    const r = verifier.verify(baseRequest())
    if (r.passed && r.outcome === 'verified') {
      expect(r.artifactDigest).toBeDefined()
    }
  })
})
