import type {
  AcquisitionAuthorization,
  PackageTrustSubject,
  ExternalSourceIdentity,
} from '@rohinik-org/package-trust-ir'

export type AcquisitionAuthorizationOutcome =
  | { readonly authorized: true; readonly authorization: AcquisitionAuthorization }
  | { readonly authorized: false; readonly reason: 'expired' | 'subject-mismatch' | 'source-mismatch' | 'missing' }

function sourceIdentityKey(s: ExternalSourceIdentity): string {
  return JSON.stringify(s)
}

function subjectKey(s: PackageTrustSubject): string {
  return `${s.packageId}@${s.version}:${sourceIdentityKey(s.sourceIdentity)}`
}

export class AcquisitionAuthorizer {
  authorize(
    authorization: AcquisitionAuthorization,
    subject: PackageTrustSubject,
    sourceIdentity: ExternalSourceIdentity,
    now: string = new Date().toISOString(),
  ): AcquisitionAuthorizationOutcome {
    if (new Date(now) >= new Date(authorization.expiresAt)) {
      return { authorized: false, reason: 'expired' }
    }

    if (subjectKey(authorization.subject) !== subjectKey(subject)) {
      return { authorized: false, reason: 'subject-mismatch' }
    }

    if (sourceIdentityKey(authorization.subject.sourceIdentity) !== sourceIdentityKey(sourceIdentity)) {
      return { authorized: false, reason: 'source-mismatch' }
    }

    return { authorized: true, authorization }
  }
}
