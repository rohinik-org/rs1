import { describe, it, expect } from 'vitest'
import { IntegrityEvidenceValidator } from '../integrity-evidence-validator.js'
import type {
  PackageTrustSubject,
  ExpectedIntegrityEvidence,
  InertArtifactHandle,
  AcquisitionAuthorization,
  AcquisitionAuthorizationId,
  StagingId,
  ExternalSourceIdentity,
  IntegrityDigest,
} from '@rohinik-org/package-trust-ir'

// ─── Fixtures ────────────────────────────────────────────────────────────────

const VALID_DIGEST: IntegrityDigest = {
  algorithm: 'sha256',
  encoding: 'hex',
  // valid 64-char hex
  value: 'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9',
}

function makeSource(): ExternalSourceIdentity {
  return { sourceKind: 'npm-registry', registryId: 'registry.npmjs.org', artifactLocator: 'lodash/-/lodash-4.17.21.tgz' }
}

function makeSubject(overrides?: Partial<PackageTrustSubject>): PackageTrustSubject {
  return {
    subjectKind: 'language-dependency',
    packageId: 'lodash',
    version: '4.17.21',
    sourceIdentity: makeSource(),
    expectedIntegrity: VALID_DIGEST,
    ...overrides,
  }
}

function makeEvidence(subject = makeSubject()): ExpectedIntegrityEvidence {
  return {
    subject,
    expectedIntegrity: VALID_DIGEST,
    authority: { authorityKind: 'registry-metadata', registryId: 'registry.npmjs.org', metadataSemanticHash: 'abc' },
    authorizationId: 'ev-001',
  }
}

function makeHandle(subject = makeSubject()): InertArtifactHandle {
  return {
    stagingId: 'stg-001' as StagingId,
    subject,
    relativeArtifactPath: 'lodash-4.17.21.tgz',
    sizeBytes: 100,
    acquiredFrom: makeSource(),
  }
}

function makeAuthorization(subject = makeSubject()): AcquisitionAuthorization {
  return {
    acquisitionAuthorizationId: 'auth-001' as AcquisitionAuthorizationId,
    subject,
    issuedAt: new Date(0).toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  }
}

const EVAL_NOW = new Date(Date.now() - 1000).toISOString()

describe('IntegrityEvidenceValidator', () => {
  const validator = new IntegrityEvidenceValidator()

  it('passes when all bindings match', () => {
    const result = validator.validate(makeSubject(), makeAuthorization(), makeHandle(), makeEvidence(), EVAL_NOW)
    expect(result.valid).toBe(true)
  })

  it('subject-kind mismatch in evidence', () => {
    const evidence = makeEvidence(makeSubject({ subjectKind: 'model-artifact' }))
    const result = validator.validate(makeSubject(), makeAuthorization(), makeHandle(), evidence, EVAL_NOW)
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.reason).toBe('subject-mismatch')
  })

  it('package-ID mismatch in evidence', () => {
    const evidence = makeEvidence(makeSubject({ packageId: 'other-pkg' }))
    const result = validator.validate(makeSubject(), makeAuthorization(), makeHandle(), evidence, EVAL_NOW)
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.reason).toBe('subject-mismatch')
  })

  it('version mismatch in evidence', () => {
    const evidence = makeEvidence(makeSubject({ version: '1.0.0' }))
    const result = validator.validate(makeSubject(), makeAuthorization(), makeHandle(), evidence, EVAL_NOW)
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.reason).toBe('subject-mismatch')
  })

  it('expected-integrity mismatch in evidence', () => {
    const differentDigest: IntegrityDigest = { ...VALID_DIGEST, value: 'a'.repeat(64) }
    const evidence = makeEvidence(makeSubject({ expectedIntegrity: differentDigest }))
    const result = validator.validate(makeSubject(), makeAuthorization(), makeHandle(), evidence, EVAL_NOW)
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.reason).toBe('subject-mismatch')
  })

  it('source-kind mismatch', () => {
    const gitSource: ExternalSourceIdentity = { sourceKind: 'git-repository', repositoryIdentity: 'github.com/lodash/lodash', commitSha: 'abc123' }
    const subjectWithGit = makeSubject({ sourceIdentity: gitSource })
    const result = validator.validate(makeSubject(), makeAuthorization(), makeHandle(), makeEvidence(), EVAL_NOW)
    // subject source is npm-registry, evidence subject is npm-registry => check git mismatch through handle
    const handleWithGit = makeHandle(subjectWithGit)
    const r2 = validator.validate(makeSubject(), makeAuthorization(), handleWithGit, makeEvidence(), EVAL_NOW)
    expect(r2.valid).toBe(false)
    if (!r2.valid) expect(['subject-mismatch', 'source-mismatch']).toContain(r2.reason)
    // Also verify cross-kind: evidence subject has git source vs requested npm-registry
    const evidenceWithGit = makeEvidence(subjectWithGit)
    const r3 = validator.validate(makeSubject(), makeAuthorization(), makeHandle(), evidenceWithGit, EVAL_NOW)
    expect(r3.valid).toBe(false)
  })

  it('registry identity mismatch in source', () => {
    const differentRegistry: ExternalSourceIdentity = { sourceKind: 'npm-registry', registryId: 'other.registry.com', artifactLocator: 'lodash/-/lodash-4.17.21.tgz' }
    const subjectWithOther = makeSubject({ sourceIdentity: differentRegistry })
    const evidenceWithOther = makeEvidence(subjectWithOther)
    const result = validator.validate(makeSubject(), makeAuthorization(), makeHandle(), evidenceWithOther, EVAL_NOW)
    expect(result.valid).toBe(false)
  })

  it('git commit mismatch', () => {
    const gitSource: ExternalSourceIdentity = { sourceKind: 'git-repository', repositoryIdentity: 'github.com/x/y', commitSha: 'aaa' }
    const gitSource2: ExternalSourceIdentity = { sourceKind: 'git-repository', repositoryIdentity: 'github.com/x/y', commitSha: 'bbb' }
    const sub1 = makeSubject({ sourceIdentity: gitSource })
    const sub2 = makeSubject({ sourceIdentity: gitSource2 })
    const evidence = makeEvidence(sub2)
    const result = validator.validate(sub1, makeAuthorization(sub1), makeHandle(sub1), evidence, EVAL_NOW)
    expect(result.valid).toBe(false)
  })

  it('direct-source identity mismatch', () => {
    const direct1: ExternalSourceIdentity = { sourceKind: 'direct-artifact', authorizedSourceId: 'src-001', artifactLocator: 'file.tgz' }
    const direct2: ExternalSourceIdentity = { sourceKind: 'direct-artifact', authorizedSourceId: 'src-999', artifactLocator: 'file.tgz' }
    const sub1 = makeSubject({ sourceIdentity: direct1 })
    const sub2 = makeSubject({ sourceIdentity: direct2 })
    const evidence = makeEvidence(sub2)
    const result = validator.validate(sub1, makeAuthorization(sub1), makeHandle(sub1), evidence, EVAL_NOW)
    expect(result.valid).toBe(false)
  })

  it('workspace identity mismatch', () => {
    const ws1: ExternalSourceIdentity = { sourceKind: 'workspace', workspaceId: 'ws-A', artifactId: 'art-1' }
    const ws2: ExternalSourceIdentity = { sourceKind: 'workspace', workspaceId: 'ws-B', artifactId: 'art-1' }
    const sub1 = makeSubject({ sourceIdentity: ws1 })
    const sub2 = makeSubject({ sourceIdentity: ws2 })
    const evidence = makeEvidence(sub2)
    const result = validator.validate(sub1, makeAuthorization(sub1), makeHandle(sub1), evidence, EVAL_NOW)
    expect(result.valid).toBe(false)
  })

  it('expired authorization', () => {
    const expiredAuth = makeAuthorization()
    ;(expiredAuth as any).expiresAt = new Date(0).toISOString()
    const freshAuth: AcquisitionAuthorization = { ...expiredAuth, expiresAt: new Date(0).toISOString() }
    const result = validator.validate(makeSubject(), freshAuth, makeHandle(), makeEvidence(), EVAL_NOW)
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.reason).toBe('authorization-expired')
  })

  it('invalid hexadecimal length — 63 chars', () => {
    const badDigest: IntegrityDigest = { algorithm: 'sha256', encoding: 'hex', value: 'a'.repeat(63) }
    const sub = makeSubject({ expectedIntegrity: badDigest })
    const evidence: ExpectedIntegrityEvidence = { subject: sub, expectedIntegrity: badDigest, authority: { authorityKind: 'registry-metadata', registryId: 'r', metadataSemanticHash: 'h' }, authorizationId: 'x' }
    const result = validator.validate(sub, makeAuthorization(sub), makeHandle(sub), evidence, EVAL_NOW)
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.reason).toBe('digest-format-invalid')
  })

  it('invalid hexadecimal character', () => {
    const badDigest: IntegrityDigest = { algorithm: 'sha256', encoding: 'hex', value: 'z'.repeat(64) }
    const sub = makeSubject({ expectedIntegrity: badDigest })
    const evidence: ExpectedIntegrityEvidence = { subject: sub, expectedIntegrity: badDigest, authority: { authorityKind: 'registry-metadata', registryId: 'r', metadataSemanticHash: 'h' }, authorizationId: 'x' }
    const result = validator.validate(sub, makeAuthorization(sub), makeHandle(sub), evidence, EVAL_NOW)
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.reason).toBe('digest-format-invalid')
  })

  it('invalid SRI prefix', () => {
    const badDigest: IntegrityDigest = { algorithm: 'sha256', encoding: 'sri-base64', value: 'md5-dGVzdA==' }
    const sub = makeSubject({ expectedIntegrity: badDigest })
    const evidence: ExpectedIntegrityEvidence = { subject: sub, expectedIntegrity: badDigest, authority: { authorityKind: 'registry-metadata', registryId: 'r', metadataSemanticHash: 'h' }, authorizationId: 'x' }
    const result = validator.validate(sub, makeAuthorization(sub), makeHandle(sub), evidence, EVAL_NOW)
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.reason).toBe('digest-format-invalid')
  })

  it('invalid Base64 characters', () => {
    const badDigest: IntegrityDigest = { algorithm: 'sha256', encoding: 'sri-base64', value: 'sha256-!!!invalid!!!' }
    const sub = makeSubject({ expectedIntegrity: badDigest })
    const evidence: ExpectedIntegrityEvidence = { subject: sub, expectedIntegrity: badDigest, authority: { authorityKind: 'registry-metadata', registryId: 'r', metadataSemanticHash: 'h' }, authorizationId: 'x' }
    const result = validator.validate(sub, makeAuthorization(sub), makeHandle(sub), evidence, EVAL_NOW)
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.reason).toBe('digest-format-invalid')
  })

  it('wrong decoded digest length — sha256 Base64 decodes to 16 bytes instead of 32', () => {
    // 16 bytes base64 = 24 chars
    const shortB64 = Buffer.alloc(16).toString('base64')
    const badDigest: IntegrityDigest = { algorithm: 'sha256', encoding: 'sri-base64', value: `sha256-${shortB64}` }
    const sub = makeSubject({ expectedIntegrity: badDigest })
    const evidence: ExpectedIntegrityEvidence = { subject: sub, expectedIntegrity: badDigest, authority: { authorityKind: 'registry-metadata', registryId: 'r', metadataSemanticHash: 'h' }, authorizationId: 'x' }
    const result = validator.validate(sub, makeAuthorization(sub), makeHandle(sub), evidence, EVAL_NOW)
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.reason).toBe('digest-format-invalid')
  })

  it('authority with all required fields passes validation', () => {
    const evidence: ExpectedIntegrityEvidence = {
      subject: makeSubject(),
      expectedIntegrity: VALID_DIGEST,
      authority: { authorityKind: 'signed-catalog', catalogId: 'cat-1', snapshotSemanticHash: 'snap-hash', signingKeyId: 'key-1' },
      authorizationId: 'auth-ev',
    }
    const result = validator.validate(makeSubject(), makeAuthorization(), makeHandle(), evidence, EVAL_NOW)
    expect(result.valid).toBe(true)
  })
})
