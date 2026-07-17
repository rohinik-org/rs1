import type { RohiniKPackageManifest } from '@rohinik-org/compiler'

export interface SignatureVerificationResult {
  readonly verified: boolean
  readonly publisherName?: string
  readonly signedAt?: string
  readonly finding?: 'SIGNATURE_INVALID' | 'SIGNATURE_MISSING' | 'PUBLIC_KEY_MISSING'
}

export async function verifySignature(
  manifest: RohiniKPackageManifest,
  requireSignature: boolean,
): Promise<SignatureVerificationResult> {
  const trust = manifest.trust
  if (!trust?.signature) {
    if (requireSignature) return { verified: false, finding: 'SIGNATURE_MISSING' }
    return { verified: true }
  }
  if (!trust.publisher.publicKey) return { verified: false, finding: 'PUBLIC_KEY_MISSING' }
  try {
    const canonicalManifest = JSON.stringify(
      Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)))
    )
    const keyBytes = Buffer.from(trust.publisher.publicKey, 'base64')
    const sigBytes = Buffer.from(trust.signature, 'base64')
    const msgBytes = Buffer.from(canonicalManifest)
    const key = await globalThis.crypto.subtle.importKey(
      'raw', keyBytes, { name: 'Ed25519' }, false, ['verify']
    )
    const verified = await globalThis.crypto.subtle.verify({ name: 'Ed25519' }, key, sigBytes, msgBytes)
    if (!verified) return { verified: false, finding: 'SIGNATURE_INVALID' }
    return {
      verified: true,
      publisherName: trust.publisher.name,
      ...(trust.signedAt ? { signedAt: trust.signedAt } : {}),
    }
  } catch {
    return { verified: false, finding: 'SIGNATURE_INVALID' }
  }
}
