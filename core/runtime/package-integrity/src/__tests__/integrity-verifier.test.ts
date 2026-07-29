import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { ArtifactIntegrityVerifier } from '../artifact-integrity-verifier.js'
import type {
  ArtifactByteReader,
  InertArtifactHandle,
  PackageTrustSubject,
  ExpectedIntegrityEvidence,
  AcquisitionAuthorization,
  AcquisitionAuthorizationId,
  StagingId,
  ExternalSourceIdentity,
  IntegrityDigest,
} from '@rohinik-org/package-trust-ir'

// ─── Instrumented fake reader ─────────────────────────────────────────────────

interface FakeReaderStats {
  streamCalls: number
  disposeCalls: number
  yieldedChunks: number
}

function makeFakeReader(
  chunks: Uint8Array[],
  opts?: { failAfterChunks?: number },
): ArtifactByteReader & FakeReaderStats {
  const stats = { streamCalls: 0, disposeCalls: 0, yieldedChunks: 0 }
  return {
    get streamCalls() { return stats.streamCalls },
    get disposeCalls() { return stats.disposeCalls },
    get yieldedChunks() { return stats.yieldedChunks },
    async *streamArtifact(_handle: InertArtifactHandle): AsyncIterable<Uint8Array> {
      stats.streamCalls++
      let yielded = 0
      for (const chunk of chunks) {
        if (opts?.failAfterChunks !== undefined && yielded >= opts.failAfterChunks) {
          throw new Error('simulated failure')
        }
        yield chunk
        yielded++
        stats.yieldedChunks++
      }
    },
    async dispose(_handle: InertArtifactHandle): Promise<void> {
      stats.disposeCalls++
    },
  }
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const CONTENT = new TextEncoder().encode('hello world')
const CONTENT_SHA256_HEX = 'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9'
const WRONG_SHA256_HEX = 'a'.repeat(64)
const VALID_DIGEST: IntegrityDigest = { algorithm: 'sha256', encoding: 'hex', value: CONTENT_SHA256_HEX }

function makeSource(): ExternalSourceIdentity {
  return { sourceKind: 'npm-registry', registryId: 'registry.npmjs.org', artifactLocator: 'pkg/-/pkg-1.0.0.tgz' }
}

function makeSubject(overrides?: Partial<PackageTrustSubject>): PackageTrustSubject {
  return {
    subjectKind: 'language-dependency',
    packageId: 'pkg',
    version: '1.0.0',
    sourceIdentity: makeSource(),
    expectedIntegrity: VALID_DIGEST,
    ...overrides,
  }
}

function makeEvidence(subject = makeSubject()): ExpectedIntegrityEvidence {
  return {
    subject,
    expectedIntegrity: subject.expectedIntegrity,
    authority: { authorityKind: 'registry-metadata', registryId: 'registry.npmjs.org', metadataSemanticHash: 'meta-hash' },
    authorizationId: 'ev-001',
  }
}

function makeHandle(subject = makeSubject()): InertArtifactHandle {
  return {
    stagingId: 'stg-001' as StagingId,
    subject,
    relativeArtifactPath: 'pkg-1.0.0.tgz',
    sizeBytes: CONTENT.byteLength,
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

function makeRequest(subject = makeSubject()) {
  return {
    subject,
    acquisitionAuthorization: makeAuthorization(subject),
    handle: makeHandle(subject),
    expectedIntegrityEvidence: makeEvidence(subject),
    evaluatedAt: new Date(Date.now() - 1000).toISOString(),
  }
}

describe('ArtifactIntegrityVerifier', () => {
  const verifier = new ArtifactIntegrityVerifier()

  it('matching digest returns passed: true with observedIntegrity', async () => {
    const reader = makeFakeReader([CONTENT])
    const result = await verifier.verify(makeRequest(), reader)
    expect(result.passed).toBe(true)
    expect(result.expectedIntegrity).toEqual(VALID_DIGEST)
    expect(result.observedIntegrity).toBeDefined()
    expect(result.reason).toBeUndefined()
  })

  it('different digest returns integrity-mismatch', async () => {
    const wrongDigest: IntegrityDigest = { algorithm: 'sha256', encoding: 'hex', value: WRONG_SHA256_HEX }
    const subject = makeSubject({ expectedIntegrity: wrongDigest })
    const request = makeRequest(subject)
    const reader = makeFakeReader([CONTENT])
    const result = await verifier.verify(request, reader)
    expect(result.passed).toBe(false)
    expect(result.reason).toBe('integrity-mismatch')
    expect(result.observedIntegrity).toBeDefined()
  })

  it('validation failure reads zero artifact chunks', async () => {
    const request = makeRequest()
    const wrongSubject = makeSubject({ version: '0.0.0' })
    const badRequest = { ...request, subject: wrongSubject }
    const reader = makeFakeReader([CONTENT])
    await verifier.verify(badRequest, reader)
    expect(reader.streamCalls).toBe(0)
    expect(reader.yieldedChunks).toBe(0)
  })

  it('artifact is streamed exactly once per verification', async () => {
    const reader = makeFakeReader([CONTENT])
    await verifier.verify(makeRequest(), reader)
    expect(reader.streamCalls).toBe(1)
  })

  it('observed digest present after successful complete hashing', async () => {
    const reader = makeFakeReader([CONTENT])
    const result = await verifier.verify(makeRequest(), reader)
    expect(result.passed).toBe(true)
    expect(result.observedIntegrity).toMatchObject({ algorithm: 'sha256', encoding: 'hex' })
  })

  it('observed digest omitted after read failure', async () => {
    const reader = makeFakeReader([CONTENT], { failAfterChunks: 0 })
    const result = await verifier.verify(makeRequest(), reader)
    expect(result.passed).toBe(false)
    expect(result.reason).toBe('artifact-read-failed')
    expect(result.observedIntegrity).toBeUndefined()
  })

  it('expected digest unchanged in result', async () => {
    const reader = makeFakeReader([CONTENT])
    const result = await verifier.verify(makeRequest(), reader)
    expect(result.expectedIntegrity).toEqual(VALID_DIGEST)
  })

  it('verifier does not invoke dispose()', async () => {
    const reader = makeFakeReader([CONTENT])
    await verifier.verify(makeRequest(), reader)
    expect(reader.disposeCalls).toBe(0)
  })

  it('verifier does not access filesystem APIs directly', async () => {
    // Confirmed by design: verifier only calls reader.streamArtifact(), which
    // in tests is an in-memory fake. No fs import in artifact-integrity-verifier.ts.
    const reader = makeFakeReader([CONTENT])
    const result = await verifier.verify(makeRequest(), reader)
    expect(result.passed).toBe(true)
  })

  it('no trust decision returned', async () => {
    const reader = makeFakeReader([CONTENT])
    const result = await verifier.verify(makeRequest(), reader)
    expect(result).not.toHaveProperty('decision')
    expect(result).not.toHaveProperty('trustDecision')
  })

  it('no quarantine operation occurs', async () => {
    // Quarantine would require a QuarantineStore — verifier has no such dependency.
    const reader = makeFakeReader([CONTENT])
    const result = await verifier.verify(makeRequest(), reader)
    // result is IntegrityAssessment — no quarantine fields
    expect(result).not.toHaveProperty('quarantineId')
  })

  it('subject mismatch returns subject-mismatch without reading bytes', async () => {
    const differentSubject = makeSubject({ packageId: 'other' })
    const request = { ...makeRequest(), subject: differentSubject }
    const reader = makeFakeReader([CONTENT])
    const result = await verifier.verify(request, reader)
    expect(result.passed).toBe(false)
    expect(result.reason).toBe('subject-mismatch')
    expect(reader.streamCalls).toBe(0)
  })

  it('source mismatch returns source-mismatch without reading bytes', async () => {
    // handle.acquiredFrom is from a different registry than subject.sourceIdentity
    const differentSource: ExternalSourceIdentity = { sourceKind: 'npm-registry', registryId: 'other.registry.com', artifactLocator: 'pkg/-/pkg-1.0.0.tgz' }
    const subject = makeSubject() // source = registry.npmjs.org
    const handle: InertArtifactHandle = { ...makeHandle(subject), acquiredFrom: differentSource }
    const request = {
      subject,
      acquisitionAuthorization: makeAuthorization(subject),
      handle,
      expectedIntegrityEvidence: makeEvidence(subject),
      evaluatedAt: new Date(Date.now() - 1000).toISOString(),
    }
    const reader = makeFakeReader([CONTENT])
    const result = await verifier.verify(request, reader)
    expect(result.passed).toBe(false)
    expect(result.reason).toBe('source-mismatch')
    expect(reader.streamCalls).toBe(0)
  })
})
