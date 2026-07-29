import { createHash, timingSafeEqual } from 'node:crypto'
import type {
  InertArtifactHandle,
  ExpectedIntegrityEvidence,
  IntegrityAssessment,
  IntegrityDigest,
  ArtifactByteReader,
} from '@rohinik-org/package-trust-ir'
import { hashPackageTrustSubject } from './subject-hash.js'

function digestsEqual(a: IntegrityDigest, b: IntegrityDigest): boolean {
  return a.algorithm === b.algorithm && a.encoding === b.encoding && a.value === b.value
}

function bufferFromDigest(digest: IntegrityDigest): Buffer {
  if (digest.algorithm === 'sha256' && digest.encoding === 'hex') {
    return Buffer.from(digest.value, 'hex')
  }
  if (digest.algorithm === 'sha512' && digest.encoding === 'sri-base64') {
    const b64 = digest.value.startsWith('sha512-') ? digest.value.slice(7) : digest.value
    return Buffer.from(b64, 'base64')
  }
  throw new Error(`Unsupported digest: ${digest.algorithm}/${digest.encoding}`)
}

function validateDigestFormat(digest: IntegrityDigest): string | null {
  if (digest.algorithm === 'sha256' && digest.encoding === 'hex') {
    return /^[0-9a-f]{64}$/.test(digest.value) ? null : 'invalid'
  }
  if (digest.algorithm === 'sha512' && digest.encoding === 'sri-base64') {
    return digest.value.startsWith('sha512-') ? null : 'invalid'
  }
  return 'invalid'
}

async function computeDigest(stream: AsyncIterable<Uint8Array>, algorithm: 'sha256' | 'sha512'): Promise<string> {
  const hash = createHash(algorithm)
  for await (const chunk of stream) {
    hash.update(chunk)
  }
  return hash.digest('hex')
}

function buildObservedDigest(observedHex: string, expected: IntegrityDigest): IntegrityDigest {
  if (expected.algorithm === 'sha512' && expected.encoding === 'sri-base64') {
    return { algorithm: 'sha512', encoding: 'sri-base64', value: `sha512-${Buffer.from(observedHex, 'hex').toString('base64')}` }
  }
  return { algorithm: expected.algorithm, encoding: expected.encoding, value: observedHex }
}

export class IntegrityVerifier {
  constructor(private readonly reader: ArtifactByteReader) {}

  async verify(handle: InertArtifactHandle, evidence: ExpectedIntegrityEvidence): Promise<IntegrityAssessment> {
    if (hashPackageTrustSubject(handle.subject) !== hashPackageTrustSubject(evidence.subject)) {
      return { passed: false, expectedIntegrity: evidence.expectedIntegrity, reason: 'subject-mismatch' }
    }
    if (!digestsEqual(evidence.expectedIntegrity, handle.subject.expectedIntegrity)) {
      return { passed: false, expectedIntegrity: evidence.expectedIntegrity, reason: 'subject-mismatch' }
    }

    const expected = evidence.expectedIntegrity
    const formatError = validateDigestFormat(expected)
    if (formatError) {
      return { passed: false, expectedIntegrity: expected, reason: 'digest-format-invalid' }
    }

    let observedHex: string
    try {
      observedHex = await computeDigest(this.reader.streamArtifact(handle), expected.algorithm)
    } catch {
      return { passed: false, expectedIntegrity: expected, reason: 'artifact-read-failed' }
    }

    const observed = buildObservedDigest(observedHex, expected)
    const expectedBuf = bufferFromDigest(expected)
    const observedBuf = bufferFromDigest(observed)

    if (expectedBuf.length !== observedBuf.length || !timingSafeEqual(expectedBuf, observedBuf)) {
      return { passed: false, expectedIntegrity: expected, observedIntegrity: observed, reason: 'integrity-mismatch' }
    }

    return { passed: true, expectedIntegrity: expected, observedIntegrity: observed }
  }
}
