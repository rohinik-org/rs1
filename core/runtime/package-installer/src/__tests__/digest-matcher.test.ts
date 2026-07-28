import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ArtifactDigestMatcher } from '../digest-matcher.js'
import type {
  VerifiedArtifactAuthorization,
  QuarantinedArtifactHandle,
  ArtifactAuthorizationId,
  AuthorizationId,
} from '@rohinik-org/provisioning-ir'

// ── helpers ───────────────────────────────────────────────────────────────────

function makeAuth(algorithm: 'sha256' | 'sha512', value: string): VerifiedArtifactAuthorization {
  return {
    artifactAuthorizationId: 'aai-1' as ArtifactAuthorizationId,
    artifact: { kind: 'rohinik-package', packageId: 'pkg-1' as import('@rohinik-org/provisioning-ir').PackageId, version: '1.0.0' },
    digest: algorithm === 'sha256'
      ? { algorithm: 'sha256', encoding: 'hex', value }
      : { algorithm: 'sha512', encoding: 'sri-base64', value },
    source: { sourceKind: 'uri', uri: 'https://example.com/artifact' },
    authorizedBy: 'auth-1' as AuthorizationId,
  }
}

async function* chunked(data: Uint8Array): AsyncIterable<Uint8Array> {
  yield data
}

function sha256hex(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex')
}

function sha512sri(data: Buffer): string {
  return `sha512-${createHash('sha512').update(data).digest('base64')}`
}

const DATA = Buffer.from('hello rohinik')
const WRONG = Buffer.from('wrong data')

// ── ArtifactDigestMatcher tests ───────────────────────────────────────────────

describe('ArtifactDigestMatcher', () => {
  const matcher = new ArtifactDigestMatcher()

  // sha256 correct
  it('matchStream sha256 correct data → matched: true', async () => {
    const auth = makeAuth('sha256', sha256hex(DATA))
    const result = await matcher.matchStream(chunked(DATA), auth)
    expect(result.matched).toBe(true)
  })

  // sha256 wrong data
  it('matchStream sha256 wrong data → matched: false with 8-hex-char prefix', async () => {
    const auth = makeAuth('sha256', sha256hex(DATA))
    const result = await matcher.matchStream(chunked(WRONG), auth)
    expect(result.matched).toBe(false)
    if (!result.matched) {
      expect(result.expectedDigestPrefix).toMatch(/^[0-9a-f]{8}$/)
      expect(result.computedDigestPrefix).toMatch(/^[0-9a-f]{8}$/)
      expect(result.expectedDigestPrefix).toBe(sha256hex(DATA).slice(0, 8))
      expect(result.computedDigestPrefix).toBe(sha256hex(WRONG).slice(0, 8))
    }
  })

  // sha512 correct
  it('matchStream sha512/SRI correct data → matched: true', async () => {
    const auth = makeAuth('sha512', sha512sri(DATA))
    const result = await matcher.matchStream(chunked(DATA), auth)
    expect(result.matched).toBe(true)
  })

  // sha512 wrong data
  it('matchStream sha512/SRI wrong data → matched: false with 8-base64-char prefix (no sha512- prefix)', async () => {
    const auth = makeAuth('sha512', sha512sri(DATA))
    const result = await matcher.matchStream(chunked(WRONG), auth)
    expect(result.matched).toBe(false)
    if (!result.matched) {
      // prefix must NOT start with "sha512-"
      expect(result.expectedDigestPrefix).not.toMatch(/^sha512-/)
      expect(result.computedDigestPrefix).not.toMatch(/^sha512-/)
      // prefix is exactly 8 chars of base64 portion
      const expectedBase64 = sha512sri(DATA).slice(7) // strip "sha512-"
      const computedBase64 = sha512sri(WRONG).slice(7)
      expect(result.expectedDigestPrefix).toBe(expectedBase64.slice(0, 8))
      expect(result.computedDigestPrefix).toBe(computedBase64.slice(0, 8))
    }
  })

  // sha256 prefix is exactly 8 lowercase hex chars
  it('sha256 prefix: exactly 8 lowercase hex chars', async () => {
    const auth = makeAuth('sha256', sha256hex(DATA))
    const result = await matcher.matchStream(chunked(WRONG), auth)
    expect(result.matched).toBe(false)
    if (!result.matched) {
      expect(result.expectedDigestPrefix).toHaveLength(8)
      expect(result.expectedDigestPrefix).toMatch(/^[0-9a-f]{8}$/)
    }
  })

  // sha512 prefix is exactly 8 chars from base64 portion
  it('sha512/SRI prefix: exactly 8 chars from base64 portion', async () => {
    const auth = makeAuth('sha512', sha512sri(DATA))
    const result = await matcher.matchStream(chunked(WRONG), auth)
    expect(result.matched).toBe(false)
    if (!result.matched) {
      expect(result.expectedDigestPrefix).toHaveLength(8)
      // base64 chars: A-Z, a-z, 0-9, +, /, =
      expect(result.expectedDigestPrefix).toMatch(/^[A-Za-z0-9+/=]{8}$/)
    }
  })

  // Consistency: "first 8 chars of native encoding value"
  it('sha256 prefix == value.slice(0,8)', async () => {
    const hexVal = sha256hex(DATA)
    const auth = makeAuth('sha256', hexVal)
    const result = await matcher.matchStream(chunked(WRONG), auth)
    expect(result.matched).toBe(false)
    if (!result.matched) {
      expect(result.expectedDigestPrefix).toBe(hexVal.slice(0, 8))
    }
  })

  it('sha512 prefix == value.slice(7,15) (base64 portion first 8 chars)', async () => {
    const sriVal = sha512sri(DATA)
    const auth = makeAuth('sha512', sriVal)
    const result = await matcher.matchStream(chunked(WRONG), auth)
    expect(result.matched).toBe(false)
    if (!result.matched) {
      expect(result.expectedDigestPrefix).toBe(sriVal.slice(7, 15))
    }
  })

  // matchFile: write tmp file, verify
  it('matchFile sha256: reads from file, matches correctly', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'digest-test-'))
    const filePath = join(dir, 'artifact.bin')
    writeFileSync(filePath, DATA)
    const auth = makeAuth('sha256', sha256hex(DATA))
    const handle: QuarantinedArtifactHandle = {
      quarantinePath: filePath as import('@rohinik-org/provisioning-ir').QuarantinePath,
      artifactAuthorizationId: 'aai-1' as ArtifactAuthorizationId,
    }
    const result = await matcher.matchFile(handle, auth)
    expect(result.matched).toBe(true)
  })

  it('matchFile sha512: reads from file, matches correctly', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'digest-test-'))
    const filePath = join(dir, 'artifact.sha512.bin')
    writeFileSync(filePath, DATA)
    const auth = makeAuth('sha512', sha512sri(DATA))
    const handle: QuarantinedArtifactHandle = {
      quarantinePath: filePath as import('@rohinik-org/provisioning-ir').QuarantinePath,
      artifactAuthorizationId: 'aai-1' as ArtifactAuthorizationId,
    }
    const result = await matcher.matchFile(handle, auth)
    expect(result.matched).toBe(true)
  })

  // diagnosticId is set on mismatch
  it('mismatch result carries diagnosticId', async () => {
    const auth = makeAuth('sha256', sha256hex(DATA))
    const result = await matcher.matchStream(chunked(WRONG), auth)
    expect(result.matched).toBe(false)
    if (!result.matched) {
      expect(result.diagnosticId).toBeTruthy()
    }
  })
})
