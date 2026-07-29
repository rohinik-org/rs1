import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { IntegrityVerifier } from '../integrity-verifier.js'
import type { InertArtifactHandle, ExpectedIntegrityEvidence, ArtifactByteReader, PackageTrustSubject, StagingId } from '@rohinik-org/package-trust-ir'

const SUBJECT: PackageTrustSubject = {
  subjectKind: 'language-dependency',
  packageId: 'lodash',
  version: '4.17.21',
  sourceIdentity: { sourceKind: 'npm-registry', registryId: 'npmjs.org', artifactLocator: 'lodash@4.17.21' },
  expectedIntegrity: { algorithm: 'sha256', encoding: 'hex', value: '' },
}

function makeReader(data: string | Uint8Array): ArtifactByteReader {
  const bytes = typeof data === 'string' ? Buffer.from(data, 'utf8') : data
  return {
    streamArtifact: (_handle) => (async function* () { yield bytes })(),
    dispose: async () => {},
  }
}

function makeHandle(subject: PackageTrustSubject): InertArtifactHandle {
  return {
    stagingId: 'staging-1' as StagingId,
    subject,
    relativeArtifactPath: 'artifact.tgz',
    sizeBytes: 100,
    acquiredFrom: subject.sourceIdentity,
  }
}

function makeEvidence(subject: PackageTrustSubject, digestHex: string): ExpectedIntegrityEvidence {
  return {
    subject,
    expectedIntegrity: { algorithm: 'sha256', encoding: 'hex', value: digestHex },
    authority: { authorityKind: 'registry-metadata', registryId: 'npmjs.org', metadataSemanticHash: 'msh' },
    authorizationId: 'auth-1',
  }
}

const DATA = 'hello world'
const DIGEST = createHash('sha256').update(DATA).digest('hex')
const SUBJECT_WITH_DIGEST: PackageTrustSubject = { ...SUBJECT, expectedIntegrity: { algorithm: 'sha256', encoding: 'hex', value: DIGEST } }

describe('IntegrityVerifier — happy path', () => {
  it('passes and returns observedIntegrity as IntegrityDigest', async () => {
    const verifier = new IntegrityVerifier(makeReader(DATA))
    const result = await verifier.verify(makeHandle(SUBJECT_WITH_DIGEST), makeEvidence(SUBJECT_WITH_DIGEST, DIGEST))
    expect(result.passed).toBe(true)
    expect(result.observedIntegrity).toEqual({ algorithm: 'sha256', encoding: 'hex', value: DIGEST })
  })
})

describe('IntegrityVerifier — integrity mismatch', () => {
  it('fails and returns both expected and observed', async () => {
    const verifier = new IntegrityVerifier(makeReader('wrong-bytes'))
    const result = await verifier.verify(makeHandle(SUBJECT_WITH_DIGEST), makeEvidence(SUBJECT_WITH_DIGEST, DIGEST))
    expect(result.passed).toBe(false)
    expect(result.reason).toBe('integrity-mismatch')
    expect(result.observedIntegrity?.value).not.toBe(DIGEST)
  })
})

describe('IntegrityVerifier — subject mismatch', () => {
  it('fails when handle subject differs from evidence subject', async () => {
    const handle = makeHandle(SUBJECT_WITH_DIGEST)
    const differentSubject = { ...SUBJECT_WITH_DIGEST, version: '5.0.0', expectedIntegrity: { algorithm: 'sha256' as const, encoding: 'hex' as const, value: 'b'.repeat(64) } }
    const evidence = makeEvidence(differentSubject, 'b'.repeat(64))
    const verifier = new IntegrityVerifier(makeReader(DATA))
    const result = await verifier.verify(handle, evidence)
    expect(result.passed).toBe(false)
    expect(result.reason).toBe('subject-mismatch')
  })
})

describe('IntegrityVerifier — stream error', () => {
  it('returns artifact-read-failed', async () => {
    const errorReader: ArtifactByteReader = {
      streamArtifact: (_h) => { throw new Error('disk error') },
      dispose: async () => {},
    }
    const verifier = new IntegrityVerifier(errorReader)
    const result = await verifier.verify(makeHandle(SUBJECT_WITH_DIGEST), makeEvidence(SUBJECT_WITH_DIGEST, DIGEST))
    expect(result.passed).toBe(false)
    expect(result.reason).toBe('artifact-read-failed')
  })
})

describe('IntegrityVerifier — digest format validation', () => {
  it('fails on malformed hex digest before reading bytes', async () => {
    const badIntegrity = { algorithm: 'sha256' as const, encoding: 'hex' as const, value: 'not-hex' }
    const badSubject = { ...SUBJECT_WITH_DIGEST, expectedIntegrity: badIntegrity }
    const badEvidence = makeEvidence(badSubject, 'not-hex')
    const handle = makeHandle(badSubject)
    const verifier = new IntegrityVerifier(makeReader(DATA))
    const result = await verifier.verify(handle, badEvidence)
    expect(result.passed).toBe(false)
    expect(result.reason).toBe('digest-format-invalid')
  })
})
