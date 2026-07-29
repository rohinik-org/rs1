import type {
  PackageTrustDecisionRequest,
  TrustDecisionResult,
  TrustDecisionOutcome,
  BlockingFinding,
  DegradingFinding,
  ManualReviewFinding,
  AdvisoryFinding,
  DecisionEvidence,
} from './types.js'
import { outcomeToDecision } from './types.js'

export class DecisionBuilder {
  build(
    request: PackageTrustDecisionRequest,
    outcome: TrustDecisionOutcome,
    evidence: DecisionEvidence,
    blocking: readonly BlockingFinding[],
    degrading: readonly DegradingFinding[],
    manualReview: readonly ManualReviewFinding[],
    advisory: readonly AdvisoryFinding[],
    restrictions: readonly string[],
  ): TrustDecisionResult {
    this.validateInvariants(outcome, blocking, degrading, manualReview)

    const reasonCodes = this.buildReasonCodes(outcome, blocking, manualReview, degrading)

    return Object.freeze({
      subject: request.subject,
      outcome,
      decision: outcomeToDecision(outcome),
      reasonCodes,
      blockingFindings: evidence.blockingFindings,
      degradingFindings: evidence.degradingFindings,
      manualReviewFindings: evidence.manualReviewFindings,
      advisoryFindings: evidence.advisoryFindings,
      restrictions: evidence.restrictions,
      assessmentTypes: evidence.assessmentTypes,
      appliedRuleIds: evidence.appliedRuleIds,
      policyId: evidence.policyId,
      policyVersion: evidence.policyVersion,
      evaluatedAt: evidence.evaluatedAt,
      integrityAssessment: request.integrityAssessment,
      signatureAssessment: request.signatureAssessment,
      publisherAssessment: request.publisherAssessment,
      revocationAssessment: request.revocationAssessment,
      provenanceAssessment: request.provenanceAssessment,
      permissionAssessment: request.permissionAssessment,
      vulnerabilityAssessment: request.vulnerabilityAssessment,
    })
  }

  private validateInvariants(
    outcome: TrustDecisionOutcome,
    blocking: readonly BlockingFinding[],
    degrading: readonly DegradingFinding[],
    manualReview: readonly ManualReviewFinding[],
  ): void {
    if (outcome === 'trusted') {
      if (blocking.length > 0) throw new Error('Invariant: trusted decision cannot have blocking findings')
      if (manualReview.length > 0) throw new Error('Invariant: trusted decision cannot have unresolved manual-review findings')
    }
    if (outcome === 'rejected') {
      if (blocking.length === 0) throw new Error('Invariant: rejected decision must have at least one blocking reason')
    }
    if (outcome === 'trusted-degraded') {
      if (blocking.length > 0) throw new Error('Invariant: trusted-degraded decision cannot have blocking findings')
      if (degrading.length === 0) throw new Error('Invariant: trusted-degraded decision must have at least one degradation')
    }
    if (outcome === 'manual-review-required') {
      if (manualReview.length === 0) throw new Error('Invariant: manual-review-required decision must have at least one review reason')
    }
  }

  private buildReasonCodes(
    outcome: TrustDecisionOutcome,
    blocking: readonly BlockingFinding[],
    manualReview: readonly ManualReviewFinding[],
    degrading: readonly DegradingFinding[],
  ): readonly string[] {
    switch (outcome) {
      case 'trusted': return ['all-assessments-passed']
      case 'trusted-degraded': return degrading.map(f => f.code).sort()
      case 'rejected': return blocking.map(f => f.code).sort()
      case 'manual-review-required': return manualReview.map(f => f.code).sort()
      case 'indeterminate': return ['insufficient-evidence']
      case 'evaluation-failed': return ['evaluation-failed']
    }
  }
}
