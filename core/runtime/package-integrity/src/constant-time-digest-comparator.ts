import type { IntegrityDigest } from '@rohinik-org/package-trust-ir'

export type DigestComparisonResult =
  | { readonly matched: true }
  | { readonly matched: false; readonly reason: 'algorithm-mismatch' | 'encoding-mismatch' | 'value-mismatch' | 'length-mismatch' | 'malformed' }

function decodeHex(value: string): Uint8Array | null {
  const normalized = value.toLowerCase()
  if (!/^[0-9a-f]+$/.test(normalized) || normalized.length % 2 !== 0) return null
  const bytes = new Uint8Array(normalized.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(normalized.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

function decodeSriBase64(value: string, algorithm: 'sha256' | 'sha512'): Uint8Array | null {
  const prefix = `${algorithm}-`
  if (!value.startsWith(prefix)) return null
  const b64 = value.slice(prefix.length)
  try {
    const binary = atob(b64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes
  } catch {
    return null
  }
}

function expectedByteLength(algorithm: 'sha256' | 'sha512'): number {
  return algorithm === 'sha256' ? 32 : 64
}

function decodeDigestBytes(digest: IntegrityDigest): Uint8Array | null {
  if (digest.encoding === 'hex') {
    return decodeHex(digest.value)
  }
  return decodeSriBase64(digest.value, digest.algorithm)
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= (a[i] as number) ^ (b[i] as number)
  }
  return diff === 0
}

export class ConstantTimeDigestComparator {
  compare(expected: IntegrityDigest, observed: IntegrityDigest): DigestComparisonResult {
    if (expected.algorithm !== observed.algorithm) {
      return { matched: false, reason: 'algorithm-mismatch' }
    }
    if (expected.encoding !== observed.encoding) {
      return { matched: false, reason: 'encoding-mismatch' }
    }

    const expectedBytes = decodeDigestBytes(expected)
    if (expectedBytes === null) {
      return { matched: false, reason: 'malformed' }
    }

    const observedBytes = decodeDigestBytes(observed)
    if (observedBytes === null) {
      return { matched: false, reason: 'malformed' }
    }

    const expectedLen = expectedByteLength(expected.algorithm)
    if (expectedBytes.length !== expectedLen || observedBytes.length !== expectedLen) {
      return { matched: false, reason: 'length-mismatch' }
    }

    if (!constantTimeEqual(expectedBytes, observedBytes)) {
      return { matched: false, reason: 'value-mismatch' }
    }

    return { matched: true }
  }
}
