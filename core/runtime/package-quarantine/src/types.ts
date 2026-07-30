import type {
  PackageTrustSubject,
  PackageTrustDecision,
  QuarantineReasonCode,
  QuarantineRecord,
  QuarantineId,
  TrustDecisionId,
  IntegrityDigest,
} from '@rohinik-org/package-trust-ir'

export type {
  PackageTrustSubject,
  PackageTrustDecision,
  QuarantineReasonCode,
  QuarantineRecord,
  QuarantineId,
  TrustDecisionId,
  IntegrityDigest,
}

// ─── Operational lifecycle state ─────────────────────────────────────────────
export type QuarantineLifecycleState =
  | 'UNQUARANTINED'
  | 'PLANNED'
  | 'CONTAINING'
  | 'QUARANTINED'
  | 'QUARANTINED_DEGRADED'
  | 'RELEASE_PENDING'
  | 'MANUAL_INTERVENTION_REQUIRED'
  | 'CONTAINMENT_FAILED'
  | 'VERIFICATION_FAILED'
  | 'SUPERSEDED'

// ─── Quarantine modes ─────────────────────────────────────────────────────────
export type QuarantineMode =
  | 'isolate'
  | 'seal'
  | 'copy-and-seal'
  | 'deny-activation'
  | 'manual-containment'

// ─── Operational outcome ──────────────────────────────────────────────────────
export type QuarantineOperationalOutcome =
  | 'not-required'
  | 'planned'
  | 'quarantined'
  | 'already-quarantined'
  | 'quarantined-degraded'
  | 'manual-intervention-required'
  | 'containment-failed'
  | 'verification-failed'
  | 'policy-conflict'
  | 'invalid-request'

// ─── Local artifact reference ─────────────────────────────────────────────────
export interface QuarantineArtifactRef {
  readonly artifactId: string
  readonly packageId: string
  readonly version?: string
  readonly sourceLocation: string
  readonly observedDigest?: string
  readonly mediaType?: string
  readonly sizeBytes?: number
  readonly acquisitionId?: string
}

// ─── Quarantine context ───────────────────────────────────────────────────────
export interface PackageQuarantineContext {
  readonly tenantId?: string
  readonly environmentId?: string
  readonly namespacePrefix?: string
}

// ─── Retention policy ─────────────────────────────────────────────────────────
export interface QuarantineRetentionPolicy {
  readonly minimumRetentionDays?: number
  readonly evidenceRetentionDays?: number
  readonly legalHold?: boolean
  readonly archiveEligibleAfterDays?: number
}

// ─── Location rule ────────────────────────────────────────────────────────────
export interface QuarantineLocationRule {
  readonly namespacePattern: string
  readonly allowedForModes: readonly QuarantineMode[]
}

// ─── Policy ───────────────────────────────────────────────────────────────────
export interface PackageQuarantinePolicy {
  readonly policyId: string
  readonly policyVersion: string
  readonly quarantineDenied: boolean
  readonly quarantineManualReview: boolean
  readonly quarantineConditionallyTrusted: boolean
  readonly allowedModes: readonly QuarantineMode[]
  readonly defaultMode: QuarantineMode
  readonly requireSourceSeal: boolean
  readonly requireDestinationVerification: boolean
  readonly requireIdentityContinuity: boolean
  readonly requireAtomicMove: boolean
  readonly allowCopyFallback: boolean
  readonly allowDegradedContainment: boolean
  readonly allowManualContainment: boolean
  readonly locationRules: readonly QuarantineLocationRule[]
  readonly retentionPolicy: QuarantineRetentionPolicy
  readonly emergencyRules?: readonly { readonly packagePattern: string; readonly quarantine: boolean }[]
}

// ─── Main request ─────────────────────────────────────────────────────────────
export interface PackageQuarantineRequest {
  readonly subject: PackageTrustSubject
  readonly trustDecision: PackageTrustDecision
  readonly trustDecisionId?: string
  readonly trustDecisionReasonCodes?: readonly QuarantineReasonCode[]
  readonly artifact: QuarantineArtifactRef
  readonly policy: PackageQuarantinePolicy
  readonly context: PackageQuarantineContext
  readonly requestedAt: string
  readonly operationId: string
}

// ─── Plan step ────────────────────────────────────────────────────────────────
export type QuarantinePlanStepKind =
  | 'acquire-lock'
  | 'validate-source'
  | 'seal-source'
  | 'create-namespace'
  | 'copy-artifact'
  | 'move-artifact'
  | 'verify-destination'
  | 'remove-activation-reference'
  | 'record-result'
  | 'release-lock'

export interface QuarantinePlanStep {
  readonly step: QuarantinePlanStepKind
  readonly required: boolean
}

export type QuarantineRollbackStrategy =
  | 'preserve-source'
  | 'restore-source'
  | 'manual-intervention'

// ─── Containment plan ─────────────────────────────────────────────────────────
export interface QuarantineContainmentPlan {
  readonly operationId: string
  readonly subject: PackageTrustSubject
  readonly trustDecisionId: string
  readonly mode: QuarantineMode
  readonly sourceLocation: string
  readonly destinationLocation?: string
  readonly steps: readonly QuarantinePlanStep[]
  readonly requiredVerifications: readonly string[]
  readonly rollbackStrategy: QuarantineRollbackStrategy
  readonly plannedAt: string
}

// ─── Storage receipts ─────────────────────────────────────────────────────────
export interface StorageReceipt {
  readonly operation: string
  readonly reference: string
  readonly completedAt: string
  readonly sizeBytes?: number
}

export interface ArtifactIdentityReceipt {
  readonly reference: string
  readonly packageId: string
  readonly version?: string
  readonly digest?: string
  readonly activatable: boolean
}

export interface ArtifactStorageStat {
  readonly exists: boolean
  readonly sizeBytes?: number
  readonly activatable?: boolean
  readonly sealed?: boolean
}

// ─── Namespace ────────────────────────────────────────────────────────────────
export interface QuarantineNamespace {
  readonly namespaceId: string
  readonly path: string
  readonly activatable: false
}

export interface QuarantineNamespaceRequest {
  readonly packageId: string
  readonly version?: string
  readonly tenantId?: string
  readonly operationId: string
}

// ─── Idempotency ─────────────────────────────────────────────────────────────
export interface ExistingQuarantineOperation {
  readonly operationId: string
  readonly outcome: QuarantineOperationalOutcome
  readonly result: PackageQuarantineResult
}

// ─── Record receipt ───────────────────────────────────────────────────────────
export interface QuarantineRecordReceipt {
  readonly recordId: string
  readonly operationId: string
}

// ─── Lifecycle transition ─────────────────────────────────────────────────────
export interface QuarantineLifecycleTransition {
  readonly from: QuarantineLifecycleState
  readonly to: QuarantineLifecycleState
  readonly at: string
  readonly reason?: string
}

// ─── Evidence ────────────────────────────────────────────────────────────────
export interface PackageQuarantineEvidence {
  readonly operationId: string
  readonly subject: PackageTrustSubject
  readonly trustDecisionId: string
  readonly trustDecision: PackageTrustDecision
  readonly policyId: string
  readonly policyVersion: string
  readonly mode: QuarantineMode
  readonly sourceLocation: string
  readonly destinationLocation?: string
  readonly storageReceipts: readonly StorageReceipt[]
  readonly verificationFindings: readonly string[]
  readonly lifecycleTransitions: readonly QuarantineLifecycleTransition[]
  readonly restrictions: readonly string[]
  readonly requestedAt: string
  readonly failureReason?: string
  readonly manualInterventionReason?: string
}

// ─── Final result ─────────────────────────────────────────────────────────────
export interface PackageQuarantineResult {
  readonly operationId: string
  readonly subject: PackageTrustSubject
  readonly outcome: QuarantineOperationalOutcome
  readonly trustDecision: PackageTrustDecision
  readonly trustDecisionId: string
  readonly policyId: string
  readonly policyVersion: string
  readonly quarantineRecord?: QuarantineRecord
  readonly evidence: PackageQuarantineEvidence
  readonly requestedAt: string
}

// ─── Events ───────────────────────────────────────────────────────────────────
export interface PackageQuarantineEvent {
  readonly eventKind:
    | 'quarantine-planned'
    | 'quarantine-started'
    | 'quarantine-completed'
    | 'quarantine-failed'
    | 'quarantine-degraded'
    | 'manual-intervention-required'
  readonly operationId: string
  readonly subject: PackageTrustSubject
  readonly outcome?: QuarantineOperationalOutcome
  readonly occurredAt: string
}

// ─── Policy evaluation ────────────────────────────────────────────────────────
export type QuarantinePolicyRequirement =
  | 'not-required'
  | 'required'
  | 'required-with-restrictions'
  | 'manual-containment-required'
  | 'policy-conflict'

// ─── Validation result ────────────────────────────────────────────────────────
export type ValidationResult =
  | { readonly valid: true }
  | { readonly valid: false; readonly reason: string }
