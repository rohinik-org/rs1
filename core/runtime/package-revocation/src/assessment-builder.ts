import type { RevocationAssessment } from '@rohinik-org/package-trust-ir'
import type { TargetRevocationResult, RevocationPolicy } from './types.js'
import { toRevocationAssessment } from './types.js'

export function buildRevocationAssessment(
  targetResults: readonly TargetRevocationResult[],
  snapshotHash: string,
  policy: RevocationPolicy,
): RevocationAssessment {
  // Any active revocation → failed
  const revokedTargets = targetResults.filter(r => r.outcome === 'revoked')
  if (revokedTargets.length > 0) {
    const first = revokedTargets[0]!
    return toRevocationAssessment(
      'revoked',
      snapshotHash,
      `${first.subject.targetKind}:${first.subject.targetId} revoked: ${first.reason ?? 'no-reason'}`,
    )
  }

  // Conflicting evidence → fails closed (L-9J-507)
  const conflictingTargets = targetResults.filter(r => r.outcome === 'conflicting-evidence')
  if (conflictingTargets.length > 0) {
    return toRevocationAssessment('conflicting-evidence', snapshotHash, `conflicting-evidence: ${conflictingTargets[0]!.subject.targetKind}:${conflictingTargets[0]!.subject.targetId}`)
  }

  // Any insufficient-context → insufficient-context
  const insufficientTargets = targetResults.filter(r => r.outcome === 'insufficient-context')
  if (insufficientTargets.length > 0) {
    return toRevocationAssessment('insufficient-context', snapshotHash, insufficientTargets[0]!.reason)
  }

  // Any evidence-unavailable and policy doesn't allow unknown → revocation-unknown
  const unavailableTargets = targetResults.filter(r => r.outcome === 'evidence-unavailable')
  if (unavailableTargets.length > 0 && !policy.allowUnknown) {
    return toRevocationAssessment('revocation-unknown', snapshotHash, 'evidence-unavailable')
  }

  // Any evidence-invalid → evidence-invalid
  const invalidTargets = targetResults.filter(r => r.outcome === 'evidence-invalid')
  if (invalidTargets.length > 0) {
    return toRevocationAssessment('evidence-invalid', snapshotHash, 'evidence-invalid')
  }

  // All clear
  return toRevocationAssessment('not-revoked', snapshotHash)
}
