import { describe, it, expect } from 'vitest'
import { ConstantTimeDigestComparator } from '../constant-time-digest-comparator.js'
import type { IntegrityDigest } from '@rohinik-org/package-trust-ir'

const SHA256_HEX = 'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9'
const OTHER_SHA256_HEX = 'a'.repeat(64)
const SHA512_HEX = '309ecc489c12d6eb4cc40f50c902f2b4d0ed77ee511a7c7a9bcd3ca86d4cd86f989dd35bc5ff499670da34255b45b0cfd830e81f605dcf7dc5542e93ae9cd76f'
const SHA256_SRI = 'sha256-uU0nuZNNPgilLlLX2n2r+sSE7+N6U4DukIj3rOLvzek='
const SHA512_SRI = 'sha512-MJ7MSJwS1utMxA9QyQLytNDtd+5RGnx6m808qG1M2G+YndNbxf9JlnDaNCVbRbDP2DDoH2Bdz33FVC6TrpzXbw=='

describe('ConstantTimeDigestComparator', () => {
  const comparator = new ConstantTimeDigestComparator()

  it('equal digest bytes succeed — hex', () => {
    const d: IntegrityDigest = { algorithm: 'sha256', encoding: 'hex', value: SHA256_HEX }
    expect(comparator.compare(d, d).matched).toBe(true)
  })

  it('equal digest bytes succeed — sri-base64', () => {
    const d: IntegrityDigest = { algorithm: 'sha256', encoding: 'sri-base64', value: SHA256_SRI }
    expect(comparator.compare(d, d).matched).toBe(true)
  })

  it('equal digest bytes succeed — sha512 hex', () => {
    const d: IntegrityDigest = { algorithm: 'sha512', encoding: 'hex', value: SHA512_HEX }
    expect(comparator.compare(d, d).matched).toBe(true)
  })

  it('equal digest bytes succeed — sha512 sri', () => {
    const d: IntegrityDigest = { algorithm: 'sha512', encoding: 'sri-base64', value: SHA512_SRI }
    expect(comparator.compare(d, d).matched).toBe(true)
  })

  it('unequal bytes fail', () => {
    const a: IntegrityDigest = { algorithm: 'sha256', encoding: 'hex', value: SHA256_HEX }
    const b: IntegrityDigest = { algorithm: 'sha256', encoding: 'hex', value: OTHER_SHA256_HEX }
    const result = comparator.compare(a, b)
    expect(result.matched).toBe(false)
    if (!result.matched) expect(result.reason).toBe('value-mismatch')
  })

  it('unequal lengths fail', () => {
    const a: IntegrityDigest = { algorithm: 'sha256', encoding: 'hex', value: SHA256_HEX }
    // sha512 hex has 128 chars — algorithm says sha256 so 64 bytes expected, 128 chars = 64 bytes OK but value is wrong length
    // Test: produce a hex value that is 60 chars (wrong length) but still hex
    const b: IntegrityDigest = { algorithm: 'sha256', encoding: 'hex', value: 'a'.repeat(60) }
    const result = comparator.compare(a, b)
    expect(result.matched).toBe(false)
  })

  it('uppercase and lowercase hexadecimal normalize correctly', () => {
    const lower: IntegrityDigest = { algorithm: 'sha256', encoding: 'hex', value: SHA256_HEX.toLowerCase() }
    const upper: IntegrityDigest = { algorithm: 'sha256', encoding: 'hex', value: SHA256_HEX.toUpperCase() }
    expect(comparator.compare(lower, upper).matched).toBe(true)
  })

  it('algorithm mismatch fails', () => {
    const a: IntegrityDigest = { algorithm: 'sha256', encoding: 'hex', value: SHA256_HEX }
    const b: IntegrityDigest = { algorithm: 'sha512', encoding: 'hex', value: SHA512_HEX }
    const result = comparator.compare(a, b)
    expect(result.matched).toBe(false)
    if (!result.matched) expect(result.reason).toBe('algorithm-mismatch')
  })

  it('encoding mismatch fails', () => {
    const a: IntegrityDigest = { algorithm: 'sha256', encoding: 'hex', value: SHA256_HEX }
    const b: IntegrityDigest = { algorithm: 'sha256', encoding: 'sri-base64', value: SHA256_SRI }
    const result = comparator.compare(a, b)
    expect(result.matched).toBe(false)
    if (!result.matched) expect(result.reason).toBe('encoding-mismatch')
  })

  it('malformed expected value fails before comparison', () => {
    const malformed: IntegrityDigest = { algorithm: 'sha256', encoding: 'hex', value: 'not-hex!!!' }
    const good: IntegrityDigest = { algorithm: 'sha256', encoding: 'hex', value: SHA256_HEX }
    const result = comparator.compare(malformed, good)
    expect(result.matched).toBe(false)
    if (!result.matched) expect(result.reason).toBe('malformed')
  })

  it('malformed observed value fails', () => {
    const good: IntegrityDigest = { algorithm: 'sha256', encoding: 'hex', value: SHA256_HEX }
    const malformed: IntegrityDigest = { algorithm: 'sha256', encoding: 'hex', value: 'z'.repeat(64) }
    const result = comparator.compare(good, malformed)
    expect(result.matched).toBe(false)
    if (!result.matched) expect(result.reason).toBe('malformed')
  })
})
