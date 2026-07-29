import type { PackageTrustSubject, SignatureAssessment, TrustRootSnapshot } from '@rohinik-org/package-trust-ir'

// ─── Publisher identity ───────────────────────────────────────────────────────

export type PublisherIdentity =
  | {
      readonly identityKind: 'registry-publisher'
      readonly registryId: string
      readonly publisherId: string
    }
  | {
      readonly identityKind: 'organization'
      readonly authorityNamespace: string
      readonly organizationId: string
    }
  | {
      readonly identityKind: 'signing-key'
      readonly algorithm: string
      readonly keyFingerprint: string
    }
  | {
      readonly identityKind: 'certificate-subject'
      readonly issuerId: string
      readonly subjectKeyId: string
    }

// ─── Trust scope ──────────────────────────────────────────────────────────────

export type TrustScope =
  | { readonly scopeKind: 'global' }
  | { readonly scopeKind: 'trust-domain'; readonly domain: string }
  | { readonly scopeKind: 'organization'; readonly authorityNamespace: string; readonly organizationId: string }
  | { readonly scopeKind: 'publisher'; readonly registryId: string; readonly publisherId: string }
  | { readonly scopeKind: 'package-namespace'; readonly namespace: string }
  | { readonly scopeKind: 'exact-package'; readonly packageId: string; readonly registryId?: string }

// ─── Trust root (extended, with scope and time bounds) ────────────────────────

export interface TrustRoot {
  readonly trustRootId: string
  readonly snapshotId: string
  readonly publisherIdentity: PublisherIdentity
  readonly scope: TrustScope
  readonly notBefore: string
  readonly notAfter: string
  readonly anchorId: string
}

// ─── Binding evidence ─────────────────────────────────────────────────────────

export type BindingEvidence =
  | {
      readonly bindingKind: 'exact-signer'
      readonly signerId: string
      readonly publisherIdentity: PublisherIdentity
    }
  | {
      readonly bindingKind: 'registered-key'
      readonly keyFingerprint: string
      readonly publisherIdentity: PublisherIdentity
    }
  | {
      readonly bindingKind: 'certificate-san'
      readonly issuerId: string
      readonly subjectKeyId: string
      readonly publisherIdentity: PublisherIdentity
    }
  | {
      readonly bindingKind: 'delegation'
      readonly delegationChain: readonly string[]
      readonly publisherIdentity: PublisherIdentity
    }

// ─── Trust path ───────────────────────────────────────────────────────────────

export interface TrustPathEdge {
  readonly fromId: string
  readonly toId: string
  readonly evidenceId: string
}

export interface TrustPath {
  readonly anchorId: string
  readonly edges: readonly TrustPathEdge[]
  readonly evidenceIds: readonly string[]
  readonly depth: number
}

// ─── Publisher trust context ──────────────────────────────────────────────────

export interface PublisherTrustContext {
  readonly bindingEvidence?: readonly BindingEvidence[]
  readonly allowedScopes?: readonly TrustScope[]
}

// ─── Trust-root provider port ─────────────────────────────────────────────────

export interface TrustRootProvider {
  resolve(request: {
    readonly publisherIdentity: PublisherIdentity
    readonly subject: PackageTrustSubject
    readonly evaluatedAt: string
  }): Promise<readonly TrustRoot[]>
}

// ─── Publisher trust assessment ───────────────────────────────────────────────

export type PublisherTrustOutcome =
  | 'trusted'
  | 'untrusted'
  | 'unknown-publisher'
  | 'signer-publisher-mismatch'
  | 'trust-root-not-found'
  | 'trust-path-not-found'
  | 'trust-scope-mismatch'
  | 'trust-root-not-yet-valid'
  | 'trust-root-expired'
  | 'publisher-identity-invalid'
  | 'signature-not-verified'
  | 'ambiguous-trust-path'
  | 'evaluation-failed'

export interface PublisherTrustAssessment {
  readonly outcome: PublisherTrustOutcome
  readonly passed: boolean
  readonly subject: PackageTrustSubject
  readonly publisherIdentity?: PublisherIdentity
  readonly signerId?: string
  readonly evaluatedAt: string
  readonly trustRootId?: string
  readonly anchorId?: string
  readonly trustPath?: TrustPath
  readonly reason?: string
}

// ─── Evaluation request ───────────────────────────────────────────────────────

export interface PublisherTrustEvaluationRequest {
  readonly subject: PackageTrustSubject
  readonly signatureAssessment: SignatureAssessment
  readonly publisherIdentity: PublisherIdentity
  readonly evaluatedAt: string
  readonly trustContext?: PublisherTrustContext
}
