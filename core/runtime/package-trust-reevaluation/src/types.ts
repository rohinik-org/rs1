import type { PackageTrustSubject, PackageTrustDecision } from '@rohinik-org/package-trust-ir'
import type {
  ArtifactIdentity,
  PolicyReference,
  AssessmentReference,
  EvidenceReference,
  PackageTrustDecisionRecord,
  RepositoryRecordId,
  OperationId,
} from '@rohinik-org/package-trust-repository'

// ─── Trigger types ────────────────────────────────────────────────────────────

export type PackageTrustReevaluationTriggerType =
  | 'policy-changed'
  | 'vulnerability-advisory-changed'
  | 'revocation-state-changed'
  | 'publisher-trust-changed'
  | 'signature-policy-changed'
  | 'provenance-policy-changed'
  | 'permission-policy-changed'
  | 'artifact-metadata-changed'
  | 'package-version-superseded'
  | 'quarantine-state-changed'
  | 'repository-integrity-changed'
  | 'manual-request'
  | 'scheduled-policy-refresh'
  | 'emergency-recall'

export type ReevaluationAuthority =
  | 'system-policy'
  | 'security-advisory'
  | 'publisher-governance'
  | 'runtime-operator'
  | 'tenant-administrator'
  | 'automated-maintenance'
  | 'emergency-authority'

export interface ReevaluationScope {
  readonly tenantIds?: readonly string[]
  readonly environmentIds?: readonly string[]
  readonly packageIds?: readonly string[]
  readonly versions?: readonly string[]
  readonly artifactDigests?: readonly string[]
  readonly policyIds?: readonly string[]
  readonly global?: boolean
}

export interface ReevaluationChangedReference {
  readonly referenceKind:
    | 'policy'
    | 'advisory'
    | 'publisher'
    | 'revocation'
    | 'signature-policy'
    | 'provenance-policy'
    | 'artifact'
  readonly referenceId: string
  readonly changeDescription?: string
}

export interface PackageTrustReevaluationTrigger {
  readonly triggerId: string
  readonly triggerType: PackageTrustReevaluationTriggerType
  readonly authority: ReevaluationAuthority
  readonly scope: ReevaluationScope
  readonly reason: string
  readonly changedReferences: readonly ReevaluationChangedReference[]
  readonly occurredAt: string
  readonly requestedAt: string
  readonly operationId: string
  readonly policyReference: PolicyReference
}

// ─── Candidate query ──────────────────────────────────────────────────────────

export interface ReevaluationCandidateQuery {
  readonly packageIds: readonly string[] | undefined
  readonly versions: readonly string[] | undefined
  readonly artifactDigests: readonly string[] | undefined
  readonly policyIds: readonly string[] | undefined
  readonly advisoryIds: readonly string[] | undefined
  readonly publisherIds: readonly string[] | undefined
  readonly revocationTargets: readonly string[] | undefined
  readonly tenantIds: readonly string[] | undefined
  readonly environmentIds: readonly string[] | undefined
  readonly olderThan: string | undefined
  readonly cursor: string | undefined
  readonly limit: number
  readonly asOf: string
}

// ─── Selection reason ─────────────────────────────────────────────────────────

export type ReevaluationReasonType =
  | 'policy-changed'
  | 'advisory-matched'
  | 'publisher-downgrade'
  | 'revocation-matched'
  | 'signature-policy-changed'
  | 'provenance-policy-changed'
  | 'permission-policy-changed'
  | 'artifact-metadata-changed'
  | 'version-superseded'
  | 'quarantine-state-changed'
  | 'repository-integrity-changed'
  | 'manual-request'
  | 'scheduled-refresh'
  | 'emergency-recall'

export interface ReevaluationSelectionReason {
  readonly reasonType: ReevaluationReasonType
  readonly triggerId: string
  readonly description: string
}

// ─── Candidate ────────────────────────────────────────────────────────────────

export interface PackageTrustReevaluationCandidate {
  readonly candidateId: string
  readonly trustDecisionRecordId: RepositoryRecordId
  readonly subject: PackageTrustSubject
  readonly artifactIdentity: ArtifactIdentity
  readonly currentDecision: PackageTrustDecision
  readonly currentPolicyReference: PolicyReference
  readonly matchedTriggerIds: readonly string[]
  readonly selectionReasons: readonly ReevaluationSelectionReason[]
  readonly repositoryRevision: number
  readonly selectedAt: string
  readonly effectiveAt?: string
  readonly tenantId?: string
}

// ─── Reevaluation policy ──────────────────────────────────────────────────────

export interface ReevaluationPriorityRule {
  readonly triggerType: PackageTrustReevaluationTriggerType
  readonly priority: number
}

export interface PackageTrustReevaluationPolicy {
  readonly policyId: string
  readonly policyVersion: string
  readonly allowedTriggerTypes: readonly PackageTrustReevaluationTriggerType[]
  readonly maxBatchSize: number
  readonly maxRetryCount: number
  readonly requireReacquisitionFor: readonly ReevaluationReasonType[]
  readonly allowAssessmentReuseFor: readonly ReevaluationReasonType[]
  readonly quarantineOnPendingDowngrade: boolean
  readonly quarantineOnPipelineFailure: boolean
  readonly allowPartialBatchSuccess: boolean
  readonly requireAtomicSuccessorPersistence: boolean
  readonly priorityRules: readonly ReevaluationPriorityRule[]
}

// ─── Assessment plan ──────────────────────────────────────────────────────────

export type AssessmentPlanKind = 'full-recompute' | 'reuse-evidence' | 'reacquire-then-recompute'

export interface ReevaluationAssessmentPlan {
  readonly planKind: AssessmentPlanKind
  readonly reuseableAssessmentKinds: readonly string[]
  readonly requiresReacquisition: boolean
  readonly reason: string
}

// ─── Input references ─────────────────────────────────────────────────────────

export interface ReevaluationInputReferences {
  readonly priorDecisionRecordId: RepositoryRecordId
  readonly assessmentReferences: readonly AssessmentReference[]
  readonly evidenceReference: EvidenceReference | undefined
  readonly currentPolicyReference: PolicyReference
}

// ─── Work item ────────────────────────────────────────────────────────────────

export interface PackageTrustReevaluationWorkItem {
  readonly workItemId: string
  readonly operationId: string
  readonly candidate: PackageTrustReevaluationCandidate
  readonly triggerIds: readonly string[]
  readonly reevaluationPolicy: PackageTrustReevaluationPolicy
  readonly assessmentPlan: ReevaluationAssessmentPlan
  readonly inputReferences: ReevaluationInputReferences
  readonly requestedAt: string
  readonly expectedRepositoryRevision: number
}

// ─── Lifecycle states ─────────────────────────────────────────────────────────

export type ReevaluationLifecycleState =
  | 'DISCOVERED'
  | 'PLANNED'
  | 'WAITING_FOR_LOCK'
  | 'RUNNING'
  | 'DECISION_PRODUCED'
  | 'PERSISTING'
  | 'QUARANTINE_PENDING'
  | 'COMPLETED'
  | 'COMPLETED_NO_CHANGE'
  | 'COMPLETED_DEGRADED'
  | 'RETRY_REQUIRED'
  | 'FAILED'
  | 'CANCELLED'
  | 'SUPERSEDED'

// ─── Pipeline types ───────────────────────────────────────────────────────────

export interface PackageTrustPipelineInput {
  readonly operationId: string
  readonly workItemId: string
  readonly subject: PackageTrustSubject
  readonly artifactIdentity: ArtifactIdentity
  readonly priorDecisionRecordId: RepositoryRecordId
  readonly assessmentPlan: ReevaluationAssessmentPlan
  readonly inputReferences: ReevaluationInputReferences
  readonly reevaluationPolicy: PackageTrustReevaluationPolicy
  readonly requestedAt: string
}

export interface PackageTrustPipelineResult {
  readonly workItemId: string
  readonly decision: PackageTrustDecision
  readonly assessmentReferences: readonly AssessmentReference[]
  readonly policyReference: PolicyReference
  readonly evidenceReference?: EvidenceReference
  readonly producedAt: string
}

// ─── Decision comparison ──────────────────────────────────────────────────────

export type TrustDecisionChangeClassification =
  | 'no-semantic-change'
  | 'trust-upgrade'
  | 'trust-downgrade'
  | 'restriction-added'
  | 'restriction-removed'
  | 'manual-review-introduced'
  | 'manual-review-resolved'
  | 'denied-introduced'
  | 'denied-resolved'
  | 'evidence-only-change'
  | 'policy-only-change'

export interface TrustDecisionComparison {
  readonly classification: TrustDecisionChangeClassification
  readonly priorDecision: PackageTrustDecision
  readonly successorDecision: PackageTrustDecision
  readonly isDowngrade: boolean
  readonly requiresQuarantine: boolean
  readonly description: string
}

// ─── Package quarantine state ─────────────────────────────────────────────────

export interface PackageQuarantineState {
  readonly isQuarantined: boolean
  readonly quarantineId?: string
  readonly quarantinedAt?: string
}

// ─── Reevaluation event ───────────────────────────────────────────────────────

export interface PackageTrustReevaluationEvent {
  readonly eventKind:
    | 'reevaluation-started'
    | 'reevaluation-completed'
    | 'reevaluation-no-change'
    | 'reevaluation-failed'
    | 'reevaluation-cancelled'
    | 'reevaluation-superseded'
    | 'quarantine-escalated'
  readonly operationId: string
  readonly workItemId: string | undefined
  readonly subject: PackageTrustSubject | undefined
  readonly priorDecisionRecordId: RepositoryRecordId | undefined
  readonly successorDecisionRecordId: RepositoryRecordId | undefined
  readonly classification: TrustDecisionChangeClassification | undefined
  readonly occurredAt: string
  readonly detail: string | undefined
}

// ─── Reevaluation outcome ─────────────────────────────────────────────────────

export type ReevaluationOutcomeKind =
  | 'completed'
  | 'completed-no-change'
  | 'completed-degraded'
  | 'retry-required'
  | 'failed'
  | 'cancelled'
  | 'superseded'
  | 'invalid-trigger'
  | 'no-candidates'
  | 'partial-success'

export interface ReevaluationItemResult {
  readonly workItemId: string
  readonly outcomeKind: ReevaluationOutcomeKind
  readonly priorDecisionRecordId: RepositoryRecordId
  readonly successorDecisionRecordId: RepositoryRecordId | undefined
  readonly comparison: TrustDecisionComparison | undefined
  readonly policyReference: PolicyReference
  readonly triggerIds: readonly string[]
  readonly failureReason: string | undefined
  readonly retryable: boolean
  readonly completedAt: string
}

export interface ReevaluationBatchResult {
  readonly operationId: string
  readonly batchOutcome: ReevaluationOutcomeKind
  readonly triggerIds: readonly string[]
  readonly itemResults: readonly ReevaluationItemResult[]
  readonly totalCandidates: number
  readonly completedCount: number
  readonly failedCount: number
  readonly noChangeCount: number
  readonly startedAt: string
  readonly completedAt: string
}

// ─── Lock handle ─────────────────────────────────────────────────────────────

export interface ReevaluationLockHandle {
  readonly key: string
  release(): Promise<void>
}

// ─── Trigger validation result ────────────────────────────────────────────────

export type TriggerValidationResult =
  | { readonly valid: true }
  | { readonly valid: false; readonly reason: string }

// ─── Retry metadata ───────────────────────────────────────────────────────────

export interface RetryMetadata {
  readonly attempt: number
  readonly maxAttempts: number
  readonly retryableError: string
}

// ─── Idempotency record ───────────────────────────────────────────────────────

export interface IdempotencyRecord {
  readonly operationId: string
  readonly workItemId: string
  readonly triggerId: string
  readonly priorTrustDecisionRecordId: RepositoryRecordId
  readonly policyId: string
  readonly policyVersion: string
  readonly result: ReevaluationItemResult
}
