import type {
  PackageTrustSubject,
  SignatureAssessment,
  RevocationAssessment,
  RevocationEntry,
  RevocationSnapshot,
} from '@rohinik-org/package-trust-ir'

export type { PackageTrustSubject, SignatureAssessment, RevocationAssessment, RevocationEntry, RevocationSnapshot }

// Supported target kinds — subset of IR-supported kinds that this evaluator handles
export type SupportedRevocationTargetKind = 'issuer' | 'key' | 'package' | 'package-version'
// artifact-digest is excluded (handled by integrity verifier, not revocation evaluator)

export interface RevocationSubject {
  readonly targetKind: SupportedRevocationTargetKind
  readonly targetId: string
}

export type InternalRevocationOutcome =
  | 'not-revoked'
  | 'revoked'
  | 'revocation-unknown'
  | 'insufficient-context'
  | 'evidence-unavailable'
  | 'evidence-invalid'
  | 'evidence-expired'
  | 'conflicting-evidence'
  | 'provider-failure'
  | 'evaluation-failed'

export interface TargetRevocationResult {
  readonly subject: RevocationSubject
  readonly outcome: InternalRevocationOutcome
  readonly revokedAt?: string
  readonly reason?: string
  readonly evidenceEntryId?: string   // RevocationEntry has no ID — use targetId+targetKind
}

export interface RevocationEvaluationContext {
  readonly subject: PackageTrustSubject
  readonly signatureAssessment: SignatureAssessment
  readonly issuerId?: string
  readonly signingKeyId?: string
  readonly packageId?: string
  readonly evaluatedAt: string
}

export interface RevocationPolicy {
  readonly requireIssuer: boolean
  readonly requireSigningKey: boolean
  readonly requirePackage: boolean
  readonly allowUnknown: boolean
}

export const DEFAULT_REVOCATION_POLICY: RevocationPolicy = {
  requireIssuer: true,
  requireSigningKey: true,
  requirePackage: false,
  allowUnknown: false,
}

export interface RevocationEvaluationRequest {
  readonly context: RevocationEvaluationContext
  readonly policy?: RevocationPolicy
  readonly snapshot: RevocationSnapshot | undefined
}

export interface RevocationEvidenceProvider {
  readonly calls: {
    readonly resolveCalls: number
    readonly requestedSubjects: readonly RevocationSubject[]
  }
  resolve(subject: RevocationSubject): readonly RevocationEntry[]
}

// Map internal outcome to IR RevocationAssessment
export function toRevocationAssessment(
  outcome: InternalRevocationOutcome,
  checkedSnapshotSemanticHash: string,
  reason?: string,
): RevocationAssessment {
  if (outcome === 'not-revoked') {
    return { decision: 'passed', checkedSnapshotSemanticHash }
  }
  if (outcome === 'revoked') {
    const result: RevocationAssessment = { decision: 'failed', checkedSnapshotSemanticHash }
    if (reason !== undefined) return { ...result, reason }
    return result
  }
  // all other outcomes (unknown, insufficient-context, etc.) → manual-review-required
  return { decision: 'manual-review-required', checkedSnapshotSemanticHash, reason: reason ?? outcome }
}
