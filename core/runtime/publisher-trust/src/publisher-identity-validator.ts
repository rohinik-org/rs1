import type { PublisherIdentity } from './types.js'

export type IdentityValidationResult =
  | { readonly valid: true }
  | { readonly valid: false; readonly reason: 'blank-id' | 'malformed-namespace' | 'missing-required-field' | 'unsupported-kind' | 'contradictory-fields' }

function isNonBlank(s: string | undefined): boolean {
  return typeof s === 'string' && s.trim().length > 0
}

function isValidNamespace(ns: string): boolean {
  return /^[a-zA-Z0-9]([a-zA-Z0-9._-]*[a-zA-Z0-9])?$/.test(ns)
}

function isValidFingerprint(fp: string): boolean {
  return /^[0-9a-fA-F:]+$/.test(fp) && fp.replace(/:/g, '').length >= 16
}

export class PublisherIdentityValidator {
  validate(identity: PublisherIdentity): IdentityValidationResult {
    switch (identity.identityKind) {
      case 'registry-publisher': {
        if (!isNonBlank(identity.registryId) || !isNonBlank(identity.publisherId)) {
          return { valid: false, reason: 'blank-id' }
        }
        if (!isValidNamespace(identity.publisherId)) {
          return { valid: false, reason: 'malformed-namespace' }
        }
        return { valid: true }
      }

      case 'organization': {
        if (!isNonBlank(identity.authorityNamespace) || !isNonBlank(identity.organizationId)) {
          return { valid: false, reason: 'blank-id' }
        }
        if (!isValidNamespace(identity.authorityNamespace) || !isValidNamespace(identity.organizationId)) {
          return { valid: false, reason: 'malformed-namespace' }
        }
        return { valid: true }
      }

      case 'signing-key': {
        if (!isNonBlank(identity.algorithm) || !isNonBlank(identity.keyFingerprint)) {
          return { valid: false, reason: 'missing-required-field' }
        }
        if (!isValidFingerprint(identity.keyFingerprint)) {
          return { valid: false, reason: 'malformed-namespace' }
        }
        return { valid: true }
      }

      case 'certificate-subject': {
        if (!isNonBlank(identity.issuerId) || !isNonBlank(identity.subjectKeyId)) {
          return { valid: false, reason: 'missing-required-field' }
        }
        return { valid: true }
      }

      default: {
        const _exhaustive: never = identity
        return { valid: false, reason: 'unsupported-kind' }
      }
    }
  }

  equals(a: PublisherIdentity, b: PublisherIdentity): boolean {
    if (a.identityKind !== b.identityKind) return false
    switch (a.identityKind) {
      case 'registry-publisher':
        return b.identityKind === 'registry-publisher' && a.registryId === b.registryId && a.publisherId === b.publisherId
      case 'organization':
        return b.identityKind === 'organization' && a.authorityNamespace === b.authorityNamespace && a.organizationId === b.organizationId
      case 'signing-key':
        return b.identityKind === 'signing-key' && a.algorithm === b.algorithm && a.keyFingerprint.toLowerCase() === b.keyFingerprint.toLowerCase()
      case 'certificate-subject':
        return b.identityKind === 'certificate-subject' && a.issuerId === b.issuerId && a.subjectKeyId === b.subjectKeyId
    }
  }
}
