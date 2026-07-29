import type {
  PackageTrustDecisionRequest,
  TrustDecisionResult,
  TrustDecisionOutcome,
  BlockingFinding,
  ManualReviewFinding,
  DegradingFinding,
  AdvisoryFinding,
} from './types.js'
import { TrustDecisionRequestValidator } from './trust-decision-request-validator.js'
import { AssessmentSetValidator } from './assessment-set-validator.js'
import { AssessmentConsistencyValidator } from './assessment-consistency-validator.js'
import { TrustPolicyCanonicalizer } from './trust-policy-canonicalizer.js'
import { TrustRuleMatcher } from './trust-rule-matcher.js'
import { TrustPrecedenceResolver } from './trust-precedence-resolver.js'
import { ManualReviewEvaluator } from './manual-review-evaluator.js'
import { DegradedTrustEvaluator } from './degraded-trust-evaluator.js'
import { DecisionEvidenceBuilder } from './decision-evidence-builder.js'
import { DecisionBuilder } from './decision-builder.js'

export class TrustDecisionEngine {
  private readonly requestValidator = new TrustDecisionRequestValidator()
  private readonly assessmentSetValidator = new AssessmentSetValidator()
  private readonly consistencyValidator = new AssessmentConsistencyValidator()
  private readonly policyCanonicalizer = new TrustPolicyCanonicalizer()
  private readonly ruleMatcher = new TrustRuleMatcher()
  private readonly precedenceResolver = new TrustPrecedenceResolver()
  private readonly manualReviewEvaluator = new ManualReviewEvaluator()
  private readonly degradedTrustEvaluator = new DegradedTrustEvaluator()
  private readonly evidenceBuilder = new DecisionEvidenceBuilder()
  private readonly decisionBuilder = new DecisionBuilder()

  decide(request: PackageTrustDecisionRequest): TrustDecisionResult {
    // Step 1: Validate request
    const requestValidation = this.requestValidator.validate(request)
    if (!requestValidation.valid) {
      return this.failedDecision(request, 'rejected', `invalid-request:${requestValidation.reason ?? 'unknown'}`)
    }

    // Step 2: Validate assessment completeness
    const setValidation = this.assessmentSetValidator.validate(request)
    if (!setValidation.complete) {
      const blocking = setValidation.findings
      const evidence = this.evidenceBuilder.build(request, blocking, [], [], [], [], [])
      return this.decisionBuilder.build(request, 'rejected', evidence, blocking, [], [], [], [])
    }

    // Step 3: Validate cross-assessment consistency
    const consistency = this.consistencyValidator.validate(request)
    const consistencyBlocking = consistency.findings.filter((f): f is BlockingFinding => f.kind === 'blocking')
    const consistencyManualReview = consistency.findings.filter((f): f is ManualReviewFinding => f.kind === 'manual-review')

    if (consistencyBlocking.length > 0) {
      const evidence = this.evidenceBuilder.build(request, consistencyBlocking, [], consistencyManualReview, [], [], [])
      return this.decisionBuilder.build(request, 'rejected', evidence, consistencyBlocking, [], consistencyManualReview, [], [])
    }

    // Step 4: Canonicalize policy
    const canonical = this.policyCanonicalizer.canonicalize(request.policy)
    if (!canonical.valid) {
      return this.failedDecision(request, 'rejected', `invalid-policy:${canonical.reason ?? 'unknown'}`)
    }

    // Step 5: Match trust rules
    const matchedRules = this.ruleMatcher.match(request, canonical)

    // Step 6: Resolve precedence — produces findings from rules
    const precedence = this.precedenceResolver.resolve(matchedRules)

    // Accumulate all blocking findings (assessment-derived + rule-derived)
    const allBlocking: BlockingFinding[] = [...consistencyBlocking, ...precedence.blockingFindings]

    // Also derive blocking from assessment outcomes
    const assessmentBlocking = this.deriveAssessmentBlocking(request)
    allBlocking.push(...assessmentBlocking)

    const sortedBlocking = [...allBlocking].sort((a, b) => a.code < b.code ? -1 : a.code > b.code ? 1 : 0)
    const sortedDegrading = [...precedence.degradingFindings].sort((a, b) => a.code < b.code ? -1 : a.code > b.code ? 1 : 0)
    const sortedAdvisory = [...precedence.advisoryFindings].sort((a, b) => a.code < b.code ? -1 : a.code > b.code ? 1 : 0)

    // Step 7: Evaluate manual-review conditions
    const manualReview = this.manualReviewEvaluator.evaluate(request, [
      ...consistencyManualReview,
      ...precedence.manualReviewFindings,
    ])

    // Hard rejection wins over everything
    if (sortedBlocking.length > 0) {
      const evidence = this.evidenceBuilder.build(
        request, sortedBlocking, sortedDegrading, manualReview.findings, sortedAdvisory,
        [], precedence.appliedRuleIds,
      )
      return this.decisionBuilder.build(
        request, 'rejected', evidence,
        sortedBlocking, sortedDegrading, manualReview.findings, sortedAdvisory, [],
      )
    }

    // Manual review (unresolved) — must not become trusted
    if (manualReview.required) {
      const evidence = this.evidenceBuilder.build(
        request, [], sortedDegrading, manualReview.findings, sortedAdvisory,
        [], precedence.appliedRuleIds,
      )
      return this.decisionBuilder.build(
        request, 'manual-review-required', evidence,
        [], sortedDegrading, manualReview.findings, sortedAdvisory, [],
      )
    }

    // Step 8: Evaluate degraded trust
    const degradedResult = this.degradedTrustEvaluator.evaluate(
      request.policy, sortedDegrading, sortedBlocking, manualReview.findings,
    )

    if (sortedDegrading.length > 0 && !degradedResult.permitted) {
      // Degradations exist but not permitted → reject
      const rejectionBlocking: BlockingFinding[] = sortedDegrading.map(d => ({
        kind: 'blocking',
        code: `unpermitted-degradation:${d.code}`,
        assessmentType: d.assessmentType,
        detail: 'Degradation not permitted by policy',
      }))
      const allBlockingFinal = [...rejectionBlocking].sort((a, b) => a.code < b.code ? -1 : a.code > b.code ? 1 : 0)
      const evidence = this.evidenceBuilder.build(
        request, allBlockingFinal, sortedDegrading, [], sortedAdvisory,
        [], precedence.appliedRuleIds,
      )
      return this.decisionBuilder.build(
        request, 'rejected', evidence,
        allBlockingFinal, sortedDegrading, [], sortedAdvisory, [],
      )
    }

    if (sortedDegrading.length > 0 && degradedResult.permitted) {
      const evidence = this.evidenceBuilder.build(
        request, [], sortedDegrading, [], sortedAdvisory,
        degradedResult.restrictions, precedence.appliedRuleIds,
      )
      return this.decisionBuilder.build(
        request, 'trusted-degraded', evidence,
        [], sortedDegrading, [], sortedAdvisory, degradedResult.restrictions,
      )
    }

    // Step 9+10: Build trusted decision
    const evidence = this.evidenceBuilder.build(
      request, [], [], [], sortedAdvisory,
      [], precedence.appliedRuleIds,
    )
    return this.decisionBuilder.build(
      request, 'trusted', evidence,
      [], [], [], sortedAdvisory, [],
    )
  }

  private deriveAssessmentBlocking(request: PackageTrustDecisionRequest): BlockingFinding[] {
    const findings: BlockingFinding[] = []
    const snapshot = request.context.policySnapshot

    // Integrity failure
    if (!request.integrityAssessment.passed) {
      findings.push({
        kind: 'blocking',
        code: `integrity-failed:${request.integrityAssessment.reason ?? 'unknown'}`,
        assessmentType: 'integrity',
        detail: `Integrity assessment failed: ${request.integrityAssessment.reason ?? 'unknown'}`,
      })
    }

    // Revocation failure
    if (request.revocationAssessment.decision === 'failed') {
      findings.push({
        kind: 'blocking',
        code: 'revocation-failed',
        assessmentType: 'revocation',
        ...(request.revocationAssessment.reason !== undefined ? { detail: request.revocationAssessment.reason } : {}),
      })
    }

    // Publisher rejected (only when policy requires publisher trust)
    const policyRequiresPublisher = request.policy.requiredAssessments.includes('publisher')
    if (policyRequiresPublisher && request.publisherAssessment.decision === 'rejected') {
      const isUnknown = request.publisherAssessment.reason === 'unknown'
      // Unknown publisher: apply unknownPublisherDecision
      if (isUnknown && snapshot.unknownPublisherDecision === 'deny') {
        findings.push({
          kind: 'blocking',
          code: 'publisher-rejected:unknown-publisher',
          assessmentType: 'publisher',
          detail: 'Unknown publisher denied by policy',
        })
      } else if (!isUnknown) {
        findings.push({
          kind: 'blocking',
          code: `publisher-rejected:${request.publisherAssessment.reason ?? 'rejected'}`,
          assessmentType: 'publisher',
          ...(request.publisherAssessment.reason !== undefined ? { detail: request.publisherAssessment.reason } : {}),
        })
      }
    }

    // Permission denied
    if (request.permissionAssessment.decision === 'denied') {
      findings.push({
        kind: 'blocking',
        code: 'permission-denied',
        assessmentType: 'permission',
        detail: 'Permission assessment decision is denied',
      })
    }

    // Vulnerability: check policy rules
    for (const vulnRule of snapshot.vulnerabilityRules) {
      if (vulnRule.effect === 'deny') {
        const hasMatch = request.vulnerabilityAssessment.findings.some(
          f => f.severity === vulnRule.severity,
        )
        if (hasMatch) {
          findings.push({
            kind: 'blocking',
            code: `vulnerability-policy-rejected:${vulnRule.severity}`,
            assessmentType: 'vulnerability',
            detail: `Vulnerability of severity '${vulnRule.severity}' denied by policy`,
          })
        }
      }
    }

    return findings
  }

  private failedDecision(
    request: PackageTrustDecisionRequest,
    outcome: TrustDecisionOutcome,
    reason: string,
  ): TrustDecisionResult {
    const blocking: BlockingFinding[] = [{
      kind: 'blocking',
      code: reason,
      assessmentType: 'request',
      detail: reason,
    }]
    const evidence = this.evidenceBuilder.build(request, blocking, [], [], [], [], [])
    return this.decisionBuilder.build(request, outcome, evidence, blocking, [], [], [], [])
  }
}
