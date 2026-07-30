import type { PackageTrustSubject, PackageTrustDecision } from '@rohinik-org/package-trust-ir'
import type {
  ArtifactIdentity,
  PolicyReference,
  RepositoryRevision,
} from '@rohinik-org/package-trust-repository'

// ─── Branded IDs ─────────────────────────────────────────────────────────────

export type AuthorizationId   = string & { readonly __brand: 'AuthorizationId' }
export type AuthorizationToken = string & { readonly __brand: 'AuthorizationToken' }

// ─── Provisioning modes ───────────────────────────────────────────────────────

export type PackageProvisioningMode =
  | 'install'
  | 'upgrade'
  | 'downgrade'
  | 'repair'
  | 'restore'
  | 'dependency-install'
  | 'manual-recovery'

// ─── Authorization outcomes ───────────────────────────────────────────────────

export type PackageProvisioningAuthorizationOutcome =
  | 'authorized'
  | 'authorized-with-conditions'
  | 'deferred'
  | 'manual-review-required'
  | 'denied'
  | 'invalid-request'
  | 'stale-snapshot'
  | 'superseded'

// ─── Authorization lifecycle states ───────────────────────────────────────────

export type AuthorizationLifecycleState =
  | 'REQUESTED'
  | 'EVALUATING'
  | 'AUTHORIZED'
  | 'AUTHORIZED_WITH_CONDITIONS'
  | 'DEFERRED'
  | 'MANUAL_REVIEW_REQUIRED'
  | 'DENIED'
  | 'CONSUMED'
  | 'EXPIRED'
  | 'INVALIDATED'
  | 'SUPERSEDED'
  | 'FAILED'

// ─── Authorization condition kinds ───────────────────────────────────────────

export type ProvisioningAuthorizationConditionKind =
  | 'sandbox-required'
  | 'network-denied'
  | 'filesystem-read-only'
  | 'tenant-isolated'
  | 'environment-limited'
  | 'no-lifecycle-hooks'
  | 'manual-activation-required'
  | 'dependency-scope-limited'
  | 'runtime-version-bounded'
  | 'single-use'
  | 'expires-at'

export interface ProvisioningAuthorizationCondition {
  readonly kind: ProvisioningAuthorizationConditionKind
  readonly detail?: string
}

// ─── Authorization reason ─────────────────────────────────────────────────────

export interface AuthorizationReason {
  readonly code: string
  readonly detail: string
}

// ─── Quarantine state (local port contract) ───────────────────────────────────

export type PackageQuarantineState =
  | 'not-quarantined'
  | 'quarantined'
  | 'quarantined-degraded'
  | 'containment-pending'
  | 'release-pending'
  | 'verification-failed'
  | 'manual-intervention-required'
  | 'unknown'

// ─── Reevaluation status (local port contract) ────────────────────────────────

export type PackageTrustReevaluationState =
  | 'not-required'
  | 'completed-current'
  | 'pending'
  | 'retry-required'
  | 'failed'
  | 'superseded'
  | 'required'

export interface PackageTrustReevaluationStatus {
  readonly trustDecisionRecordId: string
  readonly state: PackageTrustReevaluationState
  readonly asOf: string
}

// ─── Provisioning trust snapshot ─────────────────────────────────────────────

export interface PackageProvisioningTrustSnapshot {
  readonly subject: PackageTrustSubject
  readonly artifactIdentity: ArtifactIdentity
  readonly trustDecisionRecordId: string
  readonly trustDecision: PackageTrustDecision
  readonly decisionEffectiveAt: string
  readonly policyReference: PolicyReference
  readonly quarantineState: PackageQuarantineState
  readonly reevaluationState: PackageTrustReevaluationState
  readonly repositoryRevision: number
  readonly snapshotAsOf: string
  readonly superseded: boolean
  readonly current: boolean
}

// ─── Capability / permission request ─────────────────────────────────────────

export interface RequestedCapability {
  readonly capabilityId: string
  readonly capabilityVersion?: string
}

export interface RequestedPermission {
  readonly permissionId: string
  readonly permissionScope?: string
}

// ─── Provisioning authorization policy ───────────────────────────────────────

export type CapabilityConstraint  = { readonly capabilityId: string }
export type PermissionConstraint  = { readonly permissionId: string }

export interface PackageProvisioningAuthorizationPolicy {
  readonly policyId: string
  readonly policyVersion: string
  readonly allowedTrustOutcomes: readonly PackageTrustDecision[]
  readonly allowConditionalTrust: boolean
  readonly requireCurrentReevaluation: boolean
  readonly denyWhenQuarantineStateUnknown: boolean
  readonly denyOnRepositoryIntegrityWarning: boolean
  readonly allowManualRecovery: boolean
  readonly allowDowngrade: boolean
  readonly authorizationTtlSeconds: number
  readonly singleUseAuthorization: boolean
  readonly maxCapabilityScope: readonly CapabilityConstraint[]
  readonly maxPermissionScope: readonly PermissionConstraint[]
}

// ─── Provisioning authorization request ──────────────────────────────────────

export interface PackageProvisioningAuthorizationRequest {
  readonly requestId: string
  readonly operationId: string
  readonly subject: PackageTrustSubject
  readonly artifactIdentity: ArtifactIdentity
  readonly packageVersion: string
  readonly tenantId: string
  readonly environmentId: string
  readonly requestedCapabilities: readonly RequestedCapability[]
  readonly requestedPermissions: readonly RequestedPermission[]
  readonly provisioningMode: PackageProvisioningMode
  readonly policyReference: PolicyReference
  readonly requestedAt: string
  readonly expectedRepositoryRevision?: number
}

// ─── Capability scope evaluation ─────────────────────────────────────────────

export interface CapabilityRestriction {
  readonly capabilityId: string
  readonly conditionKind: ProvisioningAuthorizationConditionKind
}

export interface CapabilityScopeEvaluation {
  readonly allowed: readonly RequestedCapability[]
  readonly denied: readonly RequestedCapability[]
  readonly restricted: readonly CapabilityRestriction[]
  readonly reasons: readonly AuthorizationReason[]
}

// ─── Authorization decision ───────────────────────────────────────────────────

export interface PackageProvisioningAuthorizationDecision {
  readonly authorizationId: string
  readonly requestId: string
  readonly operationId: string
  readonly outcome: PackageProvisioningAuthorizationOutcome
  readonly subject: PackageTrustSubject
  readonly artifactIdentity: ArtifactIdentity
  readonly tenantId: string
  readonly environmentId: string
  readonly provisioningMode: PackageProvisioningMode
  readonly authorizedCapabilities: readonly RequestedCapability[]
  readonly authorizedPermissions: readonly RequestedPermission[]
  readonly conditions: readonly ProvisioningAuthorizationCondition[]
  readonly reasons: readonly AuthorizationReason[]
  readonly trustDecisionRecordId: string
  readonly repositoryRevision: number
  readonly policyReference: PolicyReference
  readonly issuedAt: string
  readonly expiresAt?: string
}

// ─── Authorization record (persisted) ────────────────────────────────────────

export interface PackageProvisioningAuthorizationRecord {
  readonly authorizationId: string
  readonly requestId: string
  readonly operationId: string
  readonly state: AuthorizationLifecycleState
  readonly outcome: PackageProvisioningAuthorizationOutcome
  readonly subject: PackageTrustSubject
  readonly artifactIdentity: ArtifactIdentity
  readonly tenantId: string
  readonly environmentId: string
  readonly provisioningMode: PackageProvisioningMode
  readonly authorizedCapabilities: readonly RequestedCapability[]
  readonly authorizedPermissions: readonly RequestedPermission[]
  readonly conditions: readonly ProvisioningAuthorizationCondition[]
  readonly reasons: readonly AuthorizationReason[]
  readonly trustDecisionRecordId: string
  readonly repositoryRevision: number
  readonly policyReference: PolicyReference
  readonly issuedAt: string
  readonly expiresAt?: string
  readonly consumedAt?: string
  readonly consumedByOperationId?: string
  readonly invalidatedAt?: string
  readonly invalidationReason?: string
  readonly tokenDigest?: string
}

// ─── Authorization write receipt ──────────────────────────────────────────────

export interface AuthorizationWriteReceipt {
  readonly authorizationId: string
  readonly operationId: string
  readonly state: AuthorizationLifecycleState
  readonly recordedAt: string
}

// ─── Transition command ───────────────────────────────────────────────────────

export type AuthorizationTransitionReason =
  | 'trust-superseded'
  | 'trust-downgraded'
  | 'quarantine-imposed'
  | 'reevaluation-required'
  | 'policy-revoked'
  | 'tenant-scope-changed'
  | 'environment-scope-changed'
  | 'artifact-replaced'
  | 'emergency-recall'
  | 'manual-operator-action'
  | 'expired'
  | 'consumed'
  | 'evaluation-complete'

export interface AuthorizationTransitionCommand {
  readonly authorizationId: string
  readonly fromState: AuthorizationLifecycleState
  readonly toState: AuthorizationLifecycleState
  readonly reason: AuthorizationTransitionReason
  readonly transitionedAt: string
  readonly consumedByOperationId?: string
  readonly tokenDigest?: string
}

// ─── Provisioning trust snapshot request ─────────────────────────────────────

export interface ProvisioningTrustSnapshotRequest {
  readonly packageId: string
  readonly version: string
  readonly artifactDigest: string
  readonly tenantId: string
  readonly environmentId: string
  readonly asOf: string
}

// ─── Authorization event ──────────────────────────────────────────────────────

export type AuthorizationEventType =
  | 'authorization-requested'
  | 'authorization-evaluating'
  | 'authorization-authorized'
  | 'authorization-authorized-with-conditions'
  | 'authorization-deferred'
  | 'authorization-manual-review-required'
  | 'authorization-denied'
  | 'authorization-consumed'
  | 'authorization-expired'
  | 'authorization-invalidated'
  | 'authorization-superseded'
  | 'authorization-failed'

export interface PackageProvisioningAuthorizationEvent {
  readonly eventId: string
  readonly eventType: AuthorizationEventType
  readonly authorizationId: string
  readonly requestId: string
  readonly operationId: string
  readonly subject: PackageTrustSubject
  readonly outcome?: PackageProvisioningAuthorizationOutcome
  readonly state: AuthorizationLifecycleState
  readonly occurredAt: string
}

// ─── Authorization lock handle ────────────────────────────────────────────────

export interface ProvisioningAuthorizationLockHandle {
  readonly key: string
  release(): void
}

// ─── Errors ───────────────────────────────────────────────────────────────────

export class AuthorizationError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly authorizationId?: string,
  ) {
    super(message)
    this.name = 'AuthorizationError'
  }
}

export class AuthorizationConflict extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'AuthorizationConflict'
  }
}
