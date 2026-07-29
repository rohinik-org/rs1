import type {
  PackageTrustDecisionRequest,
  ConsistencyValidationResult,
  BlockingFinding,
  ManualReviewFinding,
} from './types.js'

export class AssessmentConsistencyValidator {
  validate(request: PackageTrustDecisionRequest): ConsistencyValidationResult {
    const findings: (BlockingFinding | ManualReviewFinding)[] = []
    const { subject, integrityAssessment, signatureAssessment, provenanceAssessment, publisherAssessment } = request

    // Integrity: observed digest must match expected when present
    if (
      integrityAssessment.passed === false &&
      integrityAssessment.reason === 'integrity-mismatch'
    ) {
      findings.push({
        kind: 'blocking',
        code: 'artifact-digest-mismatch',
        assessmentType: 'integrity',
        detail: 'Integrity assessment reports digest mismatch',
      })
    }

    // Signature: if failed, log but leave to rule matching (signing can be optional)
    if (signatureAssessment.passed === false && signatureAssessment.reason) {
      findings.push({
        kind: 'manual-review',
        code: `signature-assessment-failed:${signatureAssessment.reason}`,
        assessmentType: 'signature',
        detail: signatureAssessment.reason,
      })
    }

    // Cross: publisher identity in provenance vs subject publisher
    if (
      subject.publisherIdentity &&
      provenanceAssessment.builderIdentity &&
      !provenanceAssessment.passed
    ) {
      findings.push({
        kind: 'manual-review',
        code: 'provenance-publisher-inconsistency',
        assessmentType: 'provenance',
        detail: 'Provenance refers to different builder from expected publisher',
      })
    }

    // Publisher assessment contradictory outcome detection
    if (publisherAssessment.decision === 'rejected' && integrityAssessment.passed) {
      // Not inherently contradictory — publisher may be rejected for reasons beyond integrity
      // Just carry the publisher finding through rule matching
    }

    // Provenance artifact mismatch
    if (!provenanceAssessment.passed && provenanceAssessment.reason === 'artifact-mismatch') {
      findings.push({
        kind: 'blocking',
        code: 'provenance-artifact-mismatch',
        assessmentType: 'provenance',
        detail: 'Provenance artifact does not match expected subject',
      })
    }

    const sortedFindings = [...findings].sort((a, b) => a.code < b.code ? -1 : a.code > b.code ? 1 : 0)
    return { consistent: findings.every(f => f.kind !== 'blocking'), findings: sortedFindings }
  }
}
