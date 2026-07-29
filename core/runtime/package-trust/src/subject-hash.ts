import { hashCanonical } from './policy-canonicalizer.js'
import type { PackageTrustSubject, ExternalSourceIdentity } from '@rohinik-org/package-trust-ir'

export function hashPackageTrustSubject(subject: PackageTrustSubject): string {
  return hashCanonical({
    subjectKind: subject.subjectKind,
    packageId: subject.packageId,
    version: subject.version,
    sourceIdentity: subject.sourceIdentity,
    expectedIntegrity: subject.expectedIntegrity,
  })
}

export function hashExternalSourceIdentity(identity: ExternalSourceIdentity): string {
  return hashCanonical(identity)
}

export function subjectsEqual(a: PackageTrustSubject, b: PackageTrustSubject): boolean {
  return hashPackageTrustSubject(a) === hashPackageTrustSubject(b)
}
