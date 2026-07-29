import type {
  PackageTrustDecisionRequest,
  ManualReviewResult,
  ManualReviewFinding,
} from './types.js'

export class ManualReviewEvaluator {
  evaluate(
    request: PackageTrustDecisionRequest,
    policyManualReviewFindings: readonly ManualReviewFinding[],
  ): ManualReviewResult {
    const findings: ManualReviewFinding[] = [...policyManualReviewFindings]

    // Upstream manual-review from publisher assessment
    if (request.publisherAssessment.decision === 'manual-review-required') {
      findings.push({
        kind: 'manual-review',
        code: 'upstream-publisher-manual-review',
        assessmentType: 'publisher',
        ...(request.publisherAssessment.reason !== undefined ? { detail: request.publisherAssessment.reason } : {}),
      })
    }

    // Upstream manual-review from revocation assessment
    if (request.revocationAssessment.decision === 'manual-review-required') {
      findings.push({
        kind: 'manual-review',
        code: 'upstream-revocation-manual-review',
        assessmentType: 'revocation',
        ...(request.revocationAssessment.reason !== undefined ? { detail: request.revocationAssessment.reason } : {}),
      })
    }

    // Missing revocation data policy
    const snapshot = request.context.policySnapshot
    if (
      snapshot.missingRevocationDataDecision === 'manual-review' &&
      !request.revocationAssessment.checkedSnapshotSemanticHash
    ) {
      findings.push({
        kind: 'manual-review',
        code: 'missing-revocation-data',
        assessmentType: 'revocation',
        detail: 'Revocation snapshot not available and policy requires manual review',
      })
    }

    // Unknown publisher policy
    if (
      snapshot.unknownPublisherDecision === 'manual-review' &&
      request.publisherAssessment.decision === 'rejected' &&
      request.publisherAssessment.reason === 'unknown'
    ) {
      findings.push({
        kind: 'manual-review',
        code: 'unknown-publisher-manual-review',
        assessmentType: 'publisher',
        detail: 'Unknown publisher triggers manual review per policy',
      })
    }

    const sortedFindings = [...findings].sort((a, b) => a.code < b.code ? -1 : a.code > b.code ? 1 : 0)

    return {
      required: sortedFindings.length > 0,
      findings: sortedFindings,
    }
  }
}
