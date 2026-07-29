import type {
  CanonicalPermission,
  PackagePermissionManifest,
  AuthorizedPermission,
  DeniedPermission,
  PermissionEnforcementCapability,
  PermissionPolicyRule,
  PackageTrustSubject,
} from '@rohinik-org/package-trust-ir'

export type {
  CanonicalPermission,
  PackagePermissionManifest,
  AuthorizedPermission,
  DeniedPermission,
  PermissionEnforcementCapability,
  PermissionPolicyRule,
  PackageTrustSubject,
}

// ─── Execution context ────────────────────────────────────────────────────────
export interface PermissionExecutionContext {
  readonly hostEnvironment?: string
  readonly deploymentMode?: string
  readonly tenantId?: string
  readonly networkZone?: string
  readonly filesystemRoots?: readonly string[]
  readonly secretNamespaces?: readonly string[]
  readonly allowedDeviceClasses?: readonly string[]
}

// ─── Combination rule ─────────────────────────────────────────────────────────
export interface PermissionCombinationRule {
  readonly domains: readonly string[]
  readonly ruleId: string
  readonly severity: 'warn' | 'deny'
}

// ─── Permission policy ────────────────────────────────────────────────────────
export interface PermissionPolicy {
  readonly rules: readonly PermissionPolicyRule[]
  readonly enforcementCapabilities: readonly PermissionEnforcementCapability[]
  readonly defaultEffect: 'deny' | 'allow'
  readonly allowWildcardsByDefault?: boolean
  readonly combinationRules?: readonly PermissionCombinationRule[]
}

// ─── Upstream assessment refs ─────────────────────────────────────────────────
export interface PublisherTrustAssessmentRef {
  readonly decision: 'accepted' | 'manual-review-required' | 'rejected'
}

export interface ProvenanceAssessmentRef {
  readonly passed: boolean
  readonly builderIdentity?: string
}

// ─── Evaluation request ───────────────────────────────────────────────────────
export interface PermissionEvaluationRequest {
  readonly subject: PackageTrustSubject
  readonly permissionManifest: PackagePermissionManifest
  readonly executionContext: PermissionExecutionContext
  readonly policy: PermissionPolicy
  readonly publisherTrustAssessment?: PublisherTrustAssessmentRef
  readonly provenanceAssessment?: ProvenanceAssessmentRef
  readonly evaluatedAt: string
  /** When provided, requested permissions are compared against these declared permissions for escalation/expansion detection. */
  readonly declaredPermissions?: readonly CanonicalPermission[]
}

// ─── Privilege expansion findings ────────────────────────────────────────────
export type ExpansionFindingKind =
  | 'undeclared-permission'
  | 'scope-expansion'
  | 'action-escalation'
  | 'wildcard-substitution'
  | 'cross-tenant-expansion'
  | 'cross-domain-expansion'

export interface PrivilegeExpansionFinding {
  readonly kind: ExpansionFindingKind
  readonly permission: CanonicalPermission
  readonly reason: string
}

// ─── Least-privilege findings ─────────────────────────────────────────────────
export type LeastPrivilegeFindingKind =
  | 'global-scope'
  | 'redundant-administrative'
  | 'unexplained-broad-permission'
  | 'exceeds-package-role'

export interface LeastPrivilegeFinding {
  readonly kind: LeastPrivilegeFindingKind
  readonly permission: CanonicalPermission
  readonly reason: string
}
