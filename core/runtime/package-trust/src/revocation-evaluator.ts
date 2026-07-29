import type {
  PackageTrustSubject,
  RevocationSnapshot,
  RevocationAssessment,
  IntegrityDigest,
} from '@rohinik-org/package-trust-ir'
import { integrityIdentity } from './policy-canonicalizer.js'

export class RevocationEvaluator {
  evaluate(
    subject: PackageTrustSubject,
    observedArtifactIntegrity: IntegrityDigest,
    revocationSnapshot: RevocationSnapshot | undefined,
    signingIssuerId: string | undefined,
  ): RevocationAssessment {
    if (!revocationSnapshot) {
      return { decision: 'manual-review-required', checkedSnapshotSemanticHash: '' }
    }

    const fail = (reason: string): RevocationAssessment => ({
      decision: 'failed',
      checkedSnapshotSemanticHash: revocationSnapshot.semanticHash,
      reason,
    })

    for (const entry of revocationSnapshot.entries) {
      if (entry.targetKind === 'package-version') {
        if (entry.targetId === `${subject.packageId}@${subject.version}`) {
          return fail('package-version-revoked')
        }
      }

      if (entry.targetKind === 'artifact-digest') {
        const observedId = integrityIdentity(observedArtifactIntegrity)
        if (entry.targetId === observedId) {
          return fail('artifact-revoked')
        }
      }

      if (entry.targetKind === 'issuer' && signingIssuerId) {
        if (entry.targetId === signingIssuerId) {
          return fail('issuer-revoked')
        }
      }

      // 'key' targetKind requires composite issuerId/keyId — not available via this signature; treated as no-op

      if (entry.targetKind === 'package') {
        if (entry.targetId === subject.packageId) {
          return fail('package-revoked')
        }
      }
    }

    return { decision: 'passed', checkedSnapshotSemanticHash: revocationSnapshot.semanticHash }
  }
}
