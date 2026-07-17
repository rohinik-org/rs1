import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { checkContentIntegrity } from '../content-integrity.js'
import { verifySignature } from '../signature-verifier.js'
import { certifyCompliance } from '../compliance-certifier.js'
import type { RohiniKPackageManifest } from '@rohinik-org/compiler'

const BASE_MANIFEST: RohiniKPackageManifest = {
  schemaVersion: '2.0', id: '@test/pkg', version: '1.0.0', type: 'adapter',
  name: 'Test', description: 'Test pkg', minimumRuntime: '>=0.1.0', minimumSdk: '1.0',
}

describe('checkContentIntegrity', () => {
  it('passes when no hash is declared', () => {
    const result = checkContentIntegrity('content', BASE_MANIFEST)
    expect(result.passed).toBe(true)
    expect(result.computedHash).toBeTruthy()
    expect(result.finding).toBeUndefined()
  })

  it('passes when hash matches', () => {
    const content = 'package content'
    const hash = createHash('sha256').update(content).digest('hex')
    const manifest: RohiniKPackageManifest = { ...BASE_MANIFEST, trust: { publisher: { name: 'Test' }, contentHash: hash } }
    const result = checkContentIntegrity(content, manifest)
    expect(result.passed).toBe(true)
  })

  it('fails with INTEGRITY_MISMATCH when hash differs', () => {
    const manifest: RohiniKPackageManifest = { ...BASE_MANIFEST, trust: { publisher: { name: 'Test' }, contentHash: 'wrong-hash' } }
    const result = checkContentIntegrity('content', manifest)
    expect(result.passed).toBe(false)
    expect(result.finding).toBe('INTEGRITY_MISMATCH')
  })
})

describe('verifySignature', () => {
  it('passes when no signature declared and not required', async () => {
    const result = await verifySignature(BASE_MANIFEST, false)
    expect(result.verified).toBe(true)
    expect(result.finding).toBeUndefined()
  })

  it('returns SIGNATURE_MISSING when required but absent', async () => {
    const result = await verifySignature(BASE_MANIFEST, true)
    expect(result.verified).toBe(false)
    expect(result.finding).toBe('SIGNATURE_MISSING')
  })

  it('returns PUBLIC_KEY_MISSING when signature present but no key', async () => {
    const manifest: RohiniKPackageManifest = {
      ...BASE_MANIFEST,
      trust: { publisher: { name: 'Test' }, signature: 'base64sig' },
    }
    const result = await verifySignature(manifest, false)
    expect(result.verified).toBe(false)
    expect(result.finding).toBe('PUBLIC_KEY_MISSING')
  })
})

describe('certifyCompliance', () => {
  it('returns level 0 with violation when no compliance declared', () => {
    const cert = certifyCompliance(BASE_MANIFEST)
    expect(cert.achievedLevel).toBe(0)
    expect(cert.violations).toContain('NO_COMPLIANCE_DECLARATION')
  })

  it('certifies level 1 when all required laws declared', () => {
    const allLaws = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17]
    const manifest: RohiniKPackageManifest = {
      ...BASE_MANIFEST,
      compliance: { targetLevel: 1, laws: allLaws, benchmarkSuites: ['routing'] },
    }
    const cert = certifyCompliance(manifest)
    expect(cert.achievedLevel).toBe(1)
    expect(cert.violations).toHaveLength(0)
    expect(cert.architectureScore).toBe(100)
  })

  it('fails certification with missing laws', () => {
    const manifest: RohiniKPackageManifest = {
      ...BASE_MANIFEST,
      compliance: { targetLevel: 1, laws: [1, 2, 3], benchmarkSuites: [] },
    }
    const cert = certifyCompliance(manifest)
    expect(cert.achievedLevel).toBe(0)
    expect(cert.violations.length).toBeGreaterThan(0)
  })
})
