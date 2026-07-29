import type {
  PackageTrustSubject,
  IntegrityAssessment,
  SignatureAssessment,
  PublisherAssessment,
  RevocationAssessment,
  ProvenanceAssessment,
  PermissionAssessment,
  VulnerabilityAssessment,
  PackageTrustPolicySnapshot,
  TrustEvaluationContext,
  PackageTrustDecision,
} from '@rohinik-org/package-trust-ir'

export type {
  PackageTrustSubject,
  IntegrityAssessment,
  SignatureAssessment,
  PublisherAssessment,
  RevocationAssessment,
  ProvenanceAssessment,
  PermissionAssessment,
  VulnerabilityAssessment,
  PackageTrustPolicySnapshot,
  TrustEvaluationContext,
  PackageTrustDecision,
}

// ─── Extended local outcome ───────────────────────────────────────────────────
// IR has: 'trusted' | 'conditionally-trusted' | 'quarantined' | 'manual-review-required' | 'denied'
// We map: trusted-degraded → 'conditionally-trusted', indeterminate → 'manual-review-required',
//         evaluation-failed → 'denied' (with reason 'evaluation-failed')
// The local TrustDecisionOutcome allows descriptive internal names that get mapped to PackageTrustDecision.
export type TrustDecisionOutcome =
  | 'trusted'
  | 'trusted-degraded'
  | 'manual-review-required'
  | 'rejected'
  | 'indeterminate'
  | 'evaluation-failed'

export function outcomeToDecision(outcome: TrustDecisionOutcome): PackageTrustDecision {
  switch (outcome) {
    case 'trusted': return 'trusted'
    case 'trusted-degraded': return 'conditionally-trusted'
    case 'manual-review-required': return 'manual-review-required'
    case 'rejected': return 'denied'
    case 'indeterminate': return 'manual-review-required'
    case 'evaluation-failed': return 'denied'
  }
}

// ─── Finding types ────────────────────────────────────────────────────────────
export interface BlockingFinding {
  readonly kind: 'blocking'
  readonly code: string
  readonly assessmentType: AssessmentType
  readonly detail?: string
}

export interface DegradingFinding {
  readonly kind: 'degrading'
  readonly code: string
  readonly assessmentType: AssessmentType
  readonly detail?: string
}

export interface ManualReviewFinding {
  readonly kind: 'manual-review'
  readonly code: string
  readonly assessmentType: AssessmentType
  readonly detail?: string
}

export interface AdvisoryFinding {
  readonly kind: 'advisory'
  readonly code: string
  readonly assessmentType: AssessmentType
  readonly detail?: string
}

export type TrustFinding = BlockingFinding | DegradingFinding | ManualReviewFinding | AdvisoryFinding

export type AssessmentType =
  | 'integrity'
  | 'signature'
  | 'publisher'
  | 'revocation'
  | 'provenance'
  | 'permission'
  | 'vulnerability'
  | 'policy'
  | 'request'

// ─── Policy trust rule ────────────────────────────────────────────────────────
export type RuleSpecificity =
  | 'exact-package-version'
  | 'exact-package'
  | 'namespace'
  | 'exact-publisher'
  | 'publisher-class'
  | 'package-class'
  | 'environment'
  | 'tenant'
  | 'global'

export type RuleEffect = 'allow' | 'deny' | 'manual-review' | 'degrade' | 'advisory'

export interface TrustRule {
  readonly ruleId: string
  readonly specificity: RuleSpecificity
  readonly effect: RuleEffect
  readonly assessmentType?: AssessmentType
  readonly matchPattern?: string
  readonly detail?: string
}

// ─── Local policy extension ───────────────────────────────────────────────────
export interface PackageTrustPolicy {
  readonly policyId: string
  readonly policyVersion: string
  readonly snapshot: PackageTrustPolicySnapshot
  readonly requiredAssessments: readonly AssessmentType[]
  readonly allowDegradedTrust: boolean
  readonly hardRejectRules: readonly TrustRule[]
  readonly manualReviewRules: readonly TrustRule[]
  readonly degradedRules: readonly TrustRule[]
  readonly advisoryRules: readonly TrustRule[]
}

// ─── Request ──────────────────────────────────────────────────────────────────
export interface PackageTrustDecisionRequest {
  readonly subject: PackageTrustSubject
  readonly integrityAssessment: IntegrityAssessment
  readonly signatureAssessment: SignatureAssessment
  readonly publisherAssessment: PublisherAssessment
  readonly revocationAssessment: RevocationAssessment
  readonly provenanceAssessment: ProvenanceAssessment
  readonly permissionAssessment: PermissionAssessment
  readonly vulnerabilityAssessment: VulnerabilityAssessment
  readonly policy: PackageTrustPolicy
  readonly context: TrustEvaluationContext
  readonly evaluatedAt: string
}

// ─── Validation results ───────────────────────────────────────────────────────
export interface RequestValidationResult {
  readonly valid: boolean
  readonly reason?: string
}

export interface AssessmentSetValidationResult {
  readonly complete: boolean
  readonly missingAssessments: readonly AssessmentType[]
  readonly findings: readonly BlockingFinding[]
}

export interface ConsistencyValidationResult {
  readonly consistent: boolean
  readonly findings: readonly (BlockingFinding | ManualReviewFinding)[]
}

// ─── Policy canonicalization ──────────────────────────────────────────────────
export interface CanonicalizedPolicy {
  readonly policy: PackageTrustPolicy
  readonly orderedRules: readonly TrustRule[]
  readonly valid: boolean
  readonly reason?: string
}

// ─── Rule matching ────────────────────────────────────────────────────────────
export interface MatchedRule {
  readonly rule: TrustRule
  readonly specificity: RuleSpecificity
}

// ─── Precedence resolution ────────────────────────────────────────────────────
export interface PrecedenceResolution {
  readonly blockingFindings: readonly BlockingFinding[]
  readonly manualReviewFindings: readonly ManualReviewFinding[]
  readonly degradingFindings: readonly DegradingFinding[]
  readonly advisoryFindings: readonly AdvisoryFinding[]
  readonly appliedRuleIds: readonly string[]
}

// ─── Degraded trust evaluation ────────────────────────────────────────────────
export interface DegradedTrustResult {
  readonly permitted: boolean
  readonly degradations: readonly DegradingFinding[]
  readonly restrictions: readonly string[]
  readonly reason?: string
}

// ─── Manual review evaluation ────────────────────────────────────────────────
export interface ManualReviewResult {
  readonly required: boolean
  readonly findings: readonly ManualReviewFinding[]
}

// ─── Decision evidence ────────────────────────────────────────────────────────
export interface DecisionEvidence {
  readonly subject: PackageTrustSubject
  readonly assessmentTypes: readonly AssessmentType[]
  readonly appliedRuleIds: readonly string[]
  readonly blockingFindings: readonly BlockingFinding[]
  readonly degradingFindings: readonly DegradingFinding[]
  readonly manualReviewFindings: readonly ManualReviewFinding[]
  readonly advisoryFindings: readonly AdvisoryFinding[]
  readonly restrictions: readonly string[]
  readonly policyId: string
  readonly policyVersion: string
  readonly evaluatedAt: string
}

// ─── Final result ─────────────────────────────────────────────────────────────
export interface TrustDecisionResult {
  readonly subject: PackageTrustSubject
  readonly outcome: TrustDecisionOutcome
  readonly decision: PackageTrustDecision
  readonly reasonCodes: readonly string[]
  readonly blockingFindings: readonly BlockingFinding[]
  readonly degradingFindings: readonly DegradingFinding[]
  readonly manualReviewFindings: readonly ManualReviewFinding[]
  readonly advisoryFindings: readonly AdvisoryFinding[]
  readonly restrictions: readonly string[]
  readonly assessmentTypes: readonly AssessmentType[]
  readonly appliedRuleIds: readonly string[]
  readonly policyId: string
  readonly policyVersion: string
  readonly evaluatedAt: string
  readonly integrityAssessment: IntegrityAssessment
  readonly signatureAssessment: SignatureAssessment
  readonly publisherAssessment: PublisherAssessment
  readonly revocationAssessment: RevocationAssessment
  readonly provenanceAssessment: ProvenanceAssessment
  readonly permissionAssessment: PermissionAssessment
  readonly vulnerabilityAssessment: VulnerabilityAssessment
}
