import type { AuthorizedCapabilityResolutionPlan, AuthorizationKeyResolver, AuthorizationIssuerId } from '@rohinik-org/provisioning-ir'
import { AuthorizationValidationError } from '@rohinik-org/provisioning-ir'
import { canonicalize, sha256Hex } from './canonicalize.js'
import type { AuthorizationProofStore } from './authorization-proof-store.js'
import { verify, type KeyObject } from 'node:crypto'

export class AuthorizationValidator {
  constructor(
    private readonly proofStore: AuthorizationProofStore,
    private readonly keyResolver: AuthorizationKeyResolver,
    private readonly knownIssuers: ReadonlySet<AuthorizationIssuerId>,
  ) {}

  async validate(plan: AuthorizedCapabilityResolutionPlan): Promise<void> {
    // Step 1: verify semantic hash
    const { semanticHash: _, authorizationProof: __, ...planProjection } = plan
    const recomputed = sha256Hex(canonicalize(planProjection)) as typeof plan.semanticHash
    if (recomputed !== plan.semanticHash) {
      throw new AuthorizationValidationError(
        'SEMANTIC_HASH_MISMATCH',
        `Semantic hash mismatch: expected ${plan.semanticHash}, got ${recomputed}`,
      )
    }

    // Step 2: proof-algorithm dispatch
    const proof = plan.authorizationProof
    if (proof.algorithm === 'in-process-token') {
      // ponytail: get() not consume() — callers must call consume() after validation to enforce single-use
      const record = this.proofStore.get(proof.token)
      if (!record) {
        throw new AuthorizationValidationError('PROOF_INVALID', 'Token not found in proof store')
      }
      if (
        record.issuer !== proof.issuer ||
        record.authorizationId !== plan.authorizationId ||
        record.signedPayloadHash !== plan.semanticHash ||
        proof.signedPayloadHash !== plan.semanticHash
      ) {
        throw new AuthorizationValidationError('PROOF_INVALID', 'Token binding mismatch')
      }
      if (!this.knownIssuers.has(proof.issuer)) {
        throw new AuthorizationValidationError('ISSUER_UNKNOWN', `Unknown issuer: ${proof.issuer}`)
      }
    } else if (proof.algorithm === 'ed25519') {
      if (!this.knownIssuers.has(proof.issuer)) {
        throw new AuthorizationValidationError('ISSUER_UNKNOWN', `Unknown issuer: ${proof.issuer}`)
      }
      const publicKey = await this.keyResolver.resolveEd25519PublicKey(proof.issuer, proof.keyId)
      if (!publicKey) {
        throw new AuthorizationValidationError(
          'ISSUER_UNKNOWN',
          `Public key not found for issuer ${proof.issuer} keyId ${proof.keyId}`,
        )
      }
      if (proof.signedPayloadHash !== plan.semanticHash) {
        throw new AuthorizationValidationError('PROOF_INVALID', 'Ed25519 proof signedPayloadHash does not match plan semanticHash')
      }
      const hashBytes = Buffer.from(plan.semanticHash, 'hex')
      const sigBytes = Buffer.from(proof.signature, 'base64')
      // ponytail: double-cast needed because AuthorizationKeyResolver returns string|Uint8Array but verify needs KeyLike; Node.js 22 accepts both
      let ok: boolean
      try {
        ok = verify(null, hashBytes, publicKey as unknown as KeyObject, sigBytes)
      } catch (err) {
        throw new AuthorizationValidationError('SIGNATURE_INVALID', `Ed25519 signature verification threw: ${err instanceof Error ? err.message : String(err)}`)
      }
      if (!ok) {
        throw new AuthorizationValidationError('SIGNATURE_INVALID', 'Ed25519 signature verification failed')
      }
    }
  }
}
