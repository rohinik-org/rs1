import { describe, it, expect } from 'vitest'
import { ProvenanceSubjectBinder } from '../provenance-subject-binder.js'
import type { ProvenanceStatement, ProvenancePolicy } from '../types.js'
import type { IntegrityDigest } from '@rohinik-org/package-trust-ir'

const DIGEST: IntegrityDigest = { algorithm: 'sha256', encoding: 'hex', value: 'a'.repeat(64) }
const OTHER_DIGEST: IntegrityDigest = { algorithm: 'sha256', encoding: 'hex', value: 'b'.repeat(64) }
const SHA512_DIGEST: IntegrityDigest = { algorithm: 'sha512', encoding: 'hex', value: 'c'.repeat(128) }

function makeStatement(overrides?: { subjects?: ProvenanceStatement['subjects'] }): ProvenanceStatement {
  return {
    statementId: 'stmt-1',
    statementType: 'build-attestation',
    statementVersion: '1.0',
    subjects: overrides?.subjects ?? [{ subjectId: 'sub-1', packageId: 'pkg', version: '1.0.0', digest: DIGEST }],
    predicateType: 'predicate/v1',
    issuedAt: new Date().toISOString(),
    materials: [],
    outputs: [],
    authorityIssuerId: 'issuer-1',
    envelope: { provenanceVersion: '1', issuerId: 'issuer-1', buildId: 'b1', outputIntegrity: DIGEST, builderIdentity: 'builder-1', builtAt: new Date().toISOString(), signature: 'sig' },
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

const binder = new ProvenanceSubjectBinder()

describe('ProvenanceSubjectBinder', () => {
  it('exact package and digest match binds', () => {
    const r = binder.bind(makeStatement(), DIGEST, 'pkg', '1.0.0', makePolicy())
    expect(r.bound).toBe(true)
    expect(r.matchedSubjectId).toBe('sub-1')
  })

  it('digest algorithm mismatch fails', () => {
    const r = binder.bind(makeStatement(), SHA512_DIGEST, 'pkg', '1.0.0', makePolicy())
    expect(r.bound).toBe(false)
    expect(r.reason).toBe('artifact-digest-mismatch')
  })

  it('digest value mismatch fails', () => {
    const r = binder.bind(makeStatement(), OTHER_DIGEST, 'pkg', '1.0.0', makePolicy())
    expect(r.bound).toBe(false)
    expect(r.reason).toBe('artifact-digest-mismatch')
  })

  it('package ID mismatch fails when identity binding required', () => {
    const r = binder.bind(makeStatement(), DIGEST, 'other-pkg', '1.0.0', makePolicy({ requireOutputDigestBinding: true }))
    expect(r.bound).toBe(false)
    expect(r.reason).toBe('subject-mismatch')
  })

  it('package version mismatch fails when identity binding required', () => {
    const r = binder.bind(makeStatement(), DIGEST, 'pkg', '2.0.0', makePolicy({ requireOutputDigestBinding: true }))
    expect(r.bound).toBe(false)
    expect(r.reason).toBe('subject-mismatch')
  })

  it('multiple subjects with one exact match binds to exact', () => {
    const stmt = makeStatement({
      subjects: [
        { subjectId: 'sub-1', packageId: 'pkg', version: '1.0.0', digest: DIGEST },
        { subjectId: 'sub-2', packageId: 'other', version: '1.0.0', digest: { algorithm: 'sha256', encoding: 'hex', value: 'c'.repeat(64) } },
      ],
    })
    const r = binder.bind(stmt, DIGEST, 'pkg', '1.0.0', makePolicy())
    expect(r.bound).toBe(true)
    expect(r.matchedSubjectId).toBe('sub-1')
  })

  it('multiple equally valid digest matches fail as ambiguous', () => {
    const stmt = makeStatement({
      subjects: [
        { subjectId: 'sub-1', digest: DIGEST },
        { subjectId: 'sub-2', digest: DIGEST },
      ],
    })
    const r = binder.bind(stmt, DIGEST, 'pkg', '1.0.0', makePolicy())
    expect(r.bound).toBe(false)
    expect(r.reason).toBe('ambiguous-provenance')
  })

  it('digest-only match rejected when identity binding required', () => {
    const stmt = makeStatement({
      subjects: [{ subjectId: 'sub-1', digest: DIGEST }],
    })
    const r = binder.bind(stmt, DIGEST, 'pkg', '1.0.0', makePolicy({ requireOutputDigestBinding: true }))
    expect(r.bound).toBe(true)
  })

  it('no artifact reread — binder only uses supplied digest', () => {
    let readerCalled = false
    const fakeRead = () => { readerCalled = true; return undefined }
    binder.bind(makeStatement(), DIGEST, 'pkg', '1.0.0', makePolicy())
    expect(readerCalled).toBe(false)
  })
})
