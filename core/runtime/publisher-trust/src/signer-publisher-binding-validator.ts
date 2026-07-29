import type { SignatureAssessment } from '@rohinik-org/package-trust-ir'
import type { PublisherIdentity, BindingEvidence } from './types.js'
import { PublisherIdentityValidator } from './publisher-identity-validator.js'

export type BindingValidationResult =
  | { readonly valid: true; readonly signerId: string }
  | { readonly valid: false; readonly reason: 'missing-binding' | 'wrong-signer' | 'delegation-cycle' | 'depth-exceeded' | 'ambiguous-binding' | 'metadata-only' | 'no-signature' }

const MAX_DELEGATION_DEPTH = 8

function publisherIdentityMatches(a: PublisherIdentity, b: PublisherIdentity): boolean {
  return new PublisherIdentityValidator().equals(a, b)
}

function findBindingForSigner(
  signerId: string,
  keyId: string | undefined,
  bindings: readonly BindingEvidence[],
  targetPublisher: PublisherIdentity,
): BindingEvidence | undefined {
  return bindings.find(b => {
    if (!publisherIdentityMatches(b.publisherIdentity, targetPublisher)) return false
    switch (b.bindingKind) {
      case 'exact-signer':
        return b.signerId === signerId
      case 'registered-key':
        return keyId !== undefined && b.keyFingerprint.toLowerCase() === keyId.toLowerCase()
      case 'certificate-san':
        return b.issuerId === signerId
      case 'delegation':
        return b.delegationChain.length > 0 && b.delegationChain[0] === signerId
    }
  })
}

function validateDelegationChain(chain: readonly string[]): { ok: true } | { ok: false; reason: 'delegation-cycle' | 'depth-exceeded' } {
  if (chain.length > MAX_DELEGATION_DEPTH) return { ok: false, reason: 'depth-exceeded' }
  const seen = new Set<string>()
  for (const id of chain) {
    if (seen.has(id)) return { ok: false, reason: 'delegation-cycle' }
    seen.add(id)
  }
  return { ok: true }
}

export class SignerPublisherBindingValidator {
  validate(
    signatureAssessment: SignatureAssessment,
    publisherIdentity: PublisherIdentity,
    bindings: readonly BindingEvidence[],
  ): BindingValidationResult {
    if (!signatureAssessment.passed) {
      return { valid: false, reason: 'no-signature' }
    }

    const signerId = signatureAssessment.issuerId
    if (!signerId) {
      return { valid: false, reason: 'missing-binding' }
    }

    const matchingBindings = bindings.filter(b => {
      if (!publisherIdentityMatches(b.publisherIdentity, publisherIdentity)) return false
      switch (b.bindingKind) {
        case 'exact-signer': return b.signerId === signerId
        case 'registered-key': return signatureAssessment.keyId !== undefined && b.keyFingerprint.toLowerCase() === signatureAssessment.keyId.toLowerCase()
        case 'certificate-san': return b.issuerId === signerId
        case 'delegation': return b.delegationChain.length > 0 && b.delegationChain[0] === signerId
      }
    })

    if (matchingBindings.length === 0) {
      return { valid: false, reason: 'wrong-signer' }
    }

    if (matchingBindings.length > 1) {
      return { valid: false, reason: 'ambiguous-binding' }
    }

    const binding = matchingBindings[0]!
    if (binding.bindingKind === 'delegation') {
      const chainCheck = validateDelegationChain(binding.delegationChain)
      if (!chainCheck.ok) return { valid: false, reason: chainCheck.reason }
    }

    return { valid: true, signerId }
  }
}
