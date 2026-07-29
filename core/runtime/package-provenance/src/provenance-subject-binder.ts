import type { IntegrityDigest } from '@rohinik-org/package-trust-ir'
import type { ProvenanceStatement, SubjectBindingResult, ProvenancePolicy } from './types.js'

export class ProvenanceSubjectBinder {
  bind(
    statement: ProvenanceStatement,
    artifactDigest: IntegrityDigest,
    packageId: string,
    version: string,
    policy: ProvenancePolicy,
  ): SubjectBindingResult {
    const candidates = statement.subjects.filter(s => this.digestMatches(s.digest, artifactDigest))

    if (candidates.length === 0) {
      return { bound: false, reason: 'artifact-digest-mismatch' }
    }

    if (policy.requireOutputDigestBinding) {
      const identityMatches = candidates.filter(s =>
        (s.packageId === undefined || s.packageId === packageId) &&
        (s.version === undefined || s.version === version),
      )

      if (identityMatches.length === 0) {
        return { bound: false, reason: 'subject-mismatch' }
      }

      if (identityMatches.length > 1) {
        const exactMatches = identityMatches.filter(s => s.packageId === packageId && s.version === version)
        if (exactMatches.length === 1) {
          return { bound: true, matchedSubjectId: exactMatches[0]!.subjectId }
        }
        return { bound: false, reason: 'ambiguous-provenance' }
      }

      return { bound: true, matchedSubjectId: identityMatches[0]!.subjectId }
    }

    if (candidates.length > 1) {
      const exactMatches = candidates.filter(s => s.packageId === packageId && s.version === version)
      if (exactMatches.length === 1) {
        return { bound: true, matchedSubjectId: exactMatches[0]!.subjectId }
      }
      return { bound: false, reason: 'ambiguous-provenance' }
    }

    return { bound: true, matchedSubjectId: candidates[0]!.subjectId }
  }

  private digestMatches(a: IntegrityDigest, b: IntegrityDigest): boolean {
    if (a.algorithm !== b.algorithm) return false
    if (a.encoding !== b.encoding) return false
    const av = a.encoding === 'hex' ? a.value.toLowerCase() : a.value
    const bv = b.encoding === 'hex' ? b.value.toLowerCase() : b.value
    return av === bv
  }
}
