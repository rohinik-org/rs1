import type {
  PackageTrustDecisionRequest,
  DecisionEvidence,
  BlockingFinding,
  DegradingFinding,
  ManualReviewFinding,
  AdvisoryFinding,
  AssessmentType,
} from './types.js'

const ALL_ASSESSMENT_TYPES: readonly AssessmentType[] = [
  'integrity',
  'signature',
  'publisher',
  'revocation',
  'provenance',
  'permission',
  'vulnerability',
]

export class DecisionEvidenceBuilder {
  build(
    request: PackageTrustDecisionRequest,
    blocking: readonly BlockingFinding[],
    degrading: readonly DegradingFinding[],
    manualReview: readonly ManualReviewFinding[],
    advisory: readonly AdvisoryFinding[],
    restrictions: readonly string[],
    appliedRuleIds: readonly string[],
  ): DecisionEvidence {
    return {
      subject: request.subject,
      assessmentTypes: ALL_ASSESSMENT_TYPES,
      appliedRuleIds: [...appliedRuleIds].sort(),
      blockingFindings: [...blocking].sort((a, b) => a.code < b.code ? -1 : a.code > b.code ? 1 : 0),
      degradingFindings: [...degrading].sort((a, b) => a.code < b.code ? -1 : a.code > b.code ? 1 : 0),
      manualReviewFindings: [...manualReview].sort((a, b) => a.code < b.code ? -1 : a.code > b.code ? 1 : 0),
      advisoryFindings: [...advisory].sort((a, b) => a.code < b.code ? -1 : a.code > b.code ? 1 : 0),
      restrictions: [...restrictions].sort(),
      policyId: request.policy.policyId,
      policyVersion: request.policy.policyVersion,
      evaluatedAt: request.evaluatedAt,
    }
  }
}
