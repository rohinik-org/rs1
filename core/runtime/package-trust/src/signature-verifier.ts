import { verify as cryptoVerify } from 'node:crypto'
import canonicalize from 'canonical-json'
import type {
  PackageTrustSubject,
  PackageSignatureEnvelope,
  PackageTrustPolicySnapshot,
  TrustRootSnapshot,
  SignatureAssessment,
  SignedPackageEnvelopePayload,
  IntegrityDigest,
} from '@rohinik-org/package-trust-ir'
import { hashPackageTrustSubject } from './subject-hash.js'
import { parseTimestamp } from './policy-canonicalizer.js'

function digestsEqual(a: IntegrityDigest, b: IntegrityDigest): boolean {
  return a.algorithm === b.algorithm && a.encoding === b.encoding && a.value === b.value
}

export class SignatureVerifier {
  async verify(
    subject: PackageTrustSubject,
    envelope: PackageSignatureEnvelope | undefined,
    policy: PackageTrustPolicySnapshot,
    trustRoot: TrustRootSnapshot,
    evaluatedAt: string,
  ): Promise<SignatureAssessment> {
    const required = policy.signatureRules.some(r => r.required)

    if (!envelope) {
      if (required) {
        return { passed: false, reason: 'signature-required' }
      }
      return { passed: true }
    }

    const issuer = trustRoot.issuers.find(
      i => i.issuerId === envelope.issuerId && i.keyId === envelope.keyId,
    )
    if (!issuer) {
      return { passed: false, issuerId: envelope.issuerId, keyId: envelope.keyId, reason: 'issuer-not-in-trust-root' }
    }
    if (issuer.status === 'revoked') {
      return { passed: false, issuerId: envelope.issuerId, keyId: envelope.keyId, reason: 'signing-key-revoked' }
    }

    const signedAt = parseTimestamp(envelope.signedAt, 'signature.signedAt')
    const evalDate = parseTimestamp(evaluatedAt, 'evaluatedAt')
    if (signedAt > evalDate) {
      return { passed: false, issuerId: envelope.issuerId, keyId: envelope.keyId, reason: 'signature-in-future' }
    }

    const subjectSemanticHash = hashPackageTrustSubject(subject)
    const stmt = envelope.signedStatement

    if (stmt.subjectSemanticHash !== subjectSemanticHash) {
      return { passed: false, issuerId: envelope.issuerId, keyId: envelope.keyId, reason: 'statement-subject-hash-mismatch' }
    }
    if (!digestsEqual(stmt.artifactIntegrity, subject.expectedIntegrity)) {
      return { passed: false, issuerId: envelope.issuerId, keyId: envelope.keyId, reason: 'statement-artifact-integrity-mismatch' }
    }
    if (stmt.manifestSemanticHash !== subject.manifestSemanticHash) {
      return { passed: false, issuerId: envelope.issuerId, keyId: envelope.keyId, reason: 'statement-manifest-hash-mismatch' }
    }
    if (stmt.permissionManifestSemanticHash !== subject.permissionManifestSemanticHash) {
      return { passed: false, issuerId: envelope.issuerId, keyId: envelope.keyId, reason: 'statement-permission-manifest-hash-mismatch' }
    }

    const payload: SignedPackageEnvelopePayload = {
      signatureVersion: envelope.signatureVersion,
      algorithm: envelope.algorithm,
      issuerId: envelope.issuerId,
      keyId: envelope.keyId,
      signedAt: envelope.signedAt,
      signedStatement: envelope.signedStatement,
    }
    const signedBytes = Buffer.from(canonicalize(payload))

    let verified: boolean
    try {
      const publicKey = Buffer.from(issuer.publicKeyReference, 'base64')
      const sig = Buffer.from(envelope.signature, 'base64')
      verified = cryptoVerify(undefined, signedBytes, { key: publicKey, format: 'der', type: 'spki' }, sig)
    } catch {
      return { passed: false, issuerId: envelope.issuerId, keyId: envelope.keyId, reason: 'signature-verification-error' }
    }

    if (!verified) {
      return { passed: false, issuerId: envelope.issuerId, keyId: envelope.keyId, reason: 'signature-invalid' }
    }

    return { passed: true, issuerId: envelope.issuerId, keyId: envelope.keyId }
  }
}
