import { describe, it, expect } from 'vitest'
import { buildRpk } from '../build-rpk.js'
import { generateEd25519KeyPair, signRpk, verifyRpkSignature, buildProvenance } from '../sign-rpk.js'
import type { RohinikPackageManifestV1 } from '@rohinik-org/package-manifest-ir'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MANIFEST: RohinikPackageManifestV1 = {
  schemaVersion: 'rohinik.package/v1',
  package: { id: 'com.example.pkg', name: 'Pkg', version: '1.0.0', type: 'capability-provider' },
}
const BUILT_AT = '2026-01-01T00:00:00.000Z'
const SIGNED_AT = '2026-01-01T00:01:00.000Z'
const KEY_ID = 'key-001'

function makeReceipt() {
  return buildRpk({
    manifest: MANIFEST,
    files: [{ path: 'dist/index.js', content: Buffer.from('export {}') }],
    builtAt: BUILT_AT,
  }).receipt
}

// ─── Sign + verify ────────────────────────────────────────────────────────────

describe('sign and verify', () => {
  it('valid signature verifies', () => {
    const kp = generateEd25519KeyPair()
    const receipt = makeReceipt()
    const sig = signRpk(receipt, kp, KEY_ID, SIGNED_AT)
    const result = verifyRpkSignature(sig, kp.publicKeyPem)
    expect(result.valid).toBe(true)
  })

  it('tampered artifact digest invalidates signature', () => {
    const kp = generateEd25519KeyPair()
    const receipt = makeReceipt()
    const sig = signRpk(receipt, kp, KEY_ID, SIGNED_AT)
    const tampered = { ...sig, payload: { ...sig.payload, artifactDigest: 'tampered' } }
    const result = verifyRpkSignature(tampered, kp.publicKeyPem)
    expect(result.valid).toBe(false)
  })

  it('tampered package identity invalidates signature', () => {
    const kp = generateEd25519KeyPair()
    const receipt = makeReceipt()
    const sig = signRpk(receipt, kp, KEY_ID, SIGNED_AT)
    const tampered = { ...sig, payload: { ...sig.payload, packageId: 'com.evil.pkg' } }
    const result = verifyRpkSignature(tampered, kp.publicKeyPem)
    expect(result.valid).toBe(false)
  })

  it('wrong public key fails verification', () => {
    const kp1 = generateEd25519KeyPair()
    const kp2 = generateEd25519KeyPair()
    const receipt = makeReceipt()
    const sig = signRpk(receipt, kp1, KEY_ID, SIGNED_AT)
    const result = verifyRpkSignature(sig, kp2.publicKeyPem)
    expect(result.valid).toBe(false)
  })

  it('malformed signature fails', () => {
    const kp = generateEd25519KeyPair()
    const receipt = makeReceipt()
    const sig = signRpk(receipt, kp, KEY_ID, SIGNED_AT)
    const bad = { ...sig, signature: 'not-a-valid-signature' }
    const result = verifyRpkSignature(bad, kp.publicKeyPem)
    expect(result.valid).toBe(false)
  })
})

// ─── Private key never leaks ──────────────────────────────────────────────────

describe('private key safety', () => {
  it('SignatureRecord contains no private key material', () => {
    const kp = generateEd25519KeyPair()
    const receipt = makeReceipt()
    const sig = signRpk(receipt, kp, KEY_ID, SIGNED_AT)
    const serialized = JSON.stringify(sig)
    expect(serialized).not.toContain('PRIVATE KEY')
    expect(serialized).not.toContain(kp.privateKeyPem.trim())
  })
})

// ─── Provenance determinism ───────────────────────────────────────────────────

describe('provenance', () => {
  it('provenance serialization is deterministic for same input', () => {
    const kp = generateEd25519KeyPair()
    const receipt = makeReceipt()
    const sig = signRpk(receipt, kp, KEY_ID, SIGNED_AT)
    const p1 = JSON.stringify(buildProvenance(sig))
    const p2 = JSON.stringify(buildProvenance(sig))
    expect(p1).toBe(p2)
  })

  it('provenance binds identity and digest', () => {
    const kp = generateEd25519KeyPair()
    const receipt = makeReceipt()
    const sig = signRpk(receipt, kp, KEY_ID, SIGNED_AT)
    const prov = buildProvenance(sig)
    expect(prov.packageId).toBe('com.example.pkg')
    expect(prov.artifactDigest).toBe(receipt.artifactDigest)
    expect(prov.algorithm).toBe('Ed25519')
    expect(Object.isFrozen(prov)).toBe(true)
  })
})
