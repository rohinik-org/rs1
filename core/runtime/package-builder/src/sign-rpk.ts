import { sign, verify, generateKeyPairSync } from 'node:crypto'
import type { BuildReceipt } from './build-rpk.js'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SigningKeyPair {
  readonly publicKeyPem: string
  readonly privateKeyPem: string
}

export interface SigningPayload {
  readonly artifactDigest: string
  readonly packageId: string
  readonly version: string
  readonly builtAt: string
  readonly keyId: string
}

export interface SignatureRecord {
  readonly keyId: string
  readonly algorithm: 'Ed25519'
  readonly signature: string
  readonly payload: SigningPayload
  readonly signedAt: string
}

export interface ProvenanceRecord {
  readonly packageId: string
  readonly version: string
  readonly artifactDigest: string
  readonly builtAt: string
  readonly signedAt: string
  readonly keyId: string
  readonly algorithm: 'Ed25519'
  readonly signature: string
}

export interface VerificationResult {
  readonly valid: boolean
  readonly reason?: string | undefined
}

// ─── Key generation ──────────────────────────────────────────────────────────

export function generateEd25519KeyPair(): SigningKeyPair {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  })
  return Object.freeze({ publicKeyPem: publicKey, privateKeyPem: privateKey })
}

// ─── Canonical signing payload ────────────────────────────────────────────────

function serializePayload(p: SigningPayload): string {
  // Deterministic: sorted keys
  return JSON.stringify({
    algorithm: 'Ed25519',
    artifactDigest: p.artifactDigest,
    builtAt: p.builtAt,
    keyId: p.keyId,
    packageId: p.packageId,
    version: p.version,
  })
}

// ─── signRpk ─────────────────────────────────────────────────────────────────

export function signRpk(
  receipt: BuildReceipt,
  keyPair: SigningKeyPair,
  keyId: string,
  signedAt: string,
): SignatureRecord {
  const payload: SigningPayload = Object.freeze({
    artifactDigest: receipt.artifactDigest,
    packageId: receipt.packageId,
    version: receipt.version,
    builtAt: receipt.builtAt,
    keyId,
  })

  // Private key material used only here — never stored on the record
  const signature = sign(null, Buffer.from(serializePayload(payload)), keyPair.privateKeyPem).toString('base64')

  return Object.freeze({
    keyId,
    algorithm: 'Ed25519' as const,
    signature,
    payload,
    signedAt,
  })
}

// ─── verifyRpkSignature ───────────────────────────────────────────────────────

export function verifyRpkSignature(
  signatureRecord: SignatureRecord,
  publicKeyPem: string,
): VerificationResult {
  if (signatureRecord.algorithm !== 'Ed25519') {
    return Object.freeze({ valid: false, reason: 'signature-failed: unsupported algorithm' })
  }
  try {
    const valid = verify(
      null,
      Buffer.from(serializePayload(signatureRecord.payload)),
      publicKeyPem,
      Buffer.from(signatureRecord.signature, 'base64'),
    )
    return Object.freeze({ valid, ...(valid ? {} : { reason: 'signature-failed: verification failed' }) })
  } catch (err) {
    return Object.freeze({ valid: false, reason: `signature-failed: ${String(err)}` })
  }
}

// ─── buildProvenance ──────────────────────────────────────────────────────────

export function buildProvenance(sig: SignatureRecord): ProvenanceRecord {
  return Object.freeze({
    packageId: sig.payload.packageId,
    version: sig.payload.version,
    artifactDigest: sig.payload.artifactDigest,
    builtAt: sig.payload.builtAt,
    signedAt: sig.signedAt,
    keyId: sig.keyId,
    algorithm: sig.algorithm,
    signature: sig.signature,
  })
}
