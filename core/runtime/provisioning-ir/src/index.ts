// ── Type-only imports from sibling IR packages (used in types below) ──────────
import type { CapabilityId } from '@rohinik-org/capability-ir'
import type { IsoTimestamp } from '@rohinik-org/capability-contracts-ir'
import type { PackageId, ResolutionPlanId, ResolutionPlanSemanticHash } from '@rohinik-org/resolution-graph-ir'

// ── Type-only re-exports from sibling IR packages ────────────────────────────
export type { CapabilityId } from '@rohinik-org/capability-ir'
export type { IsoTimestamp } from '@rohinik-org/capability-contracts-ir'
export type { PackageId, ResolutionPlanId, ResolutionPlanSemanticHash } from '@rohinik-org/resolution-graph-ir'

// ── Opaque IDs ────────────────────────────────────────────────────────────────
export type ProvisioningExecutionId         = string & { readonly __brand: 'ProvisioningExecutionId' }
export type ProvisioningActionId            = string & { readonly __brand: 'ProvisioningActionId' }
export type ProvisioningMutationId          = string & { readonly __brand: 'ProvisioningMutationId' }
export type AuthorizationId                 = string & { readonly __brand: 'AuthorizationId' }
export type AuthorizationIssuerId           = string & { readonly __brand: 'AuthorizationIssuerId' }
export type AuthorizationDecisionId         = string & { readonly __brand: 'AuthorizationDecisionId' }
export type ArtifactAuthorizationId         = string & { readonly __brand: 'ArtifactAuthorizationId' }
export type AuthorizedPlanSemanticHash      = string & { readonly __brand: 'AuthorizedPlanSemanticHash' }
export type NpmInstallManifestHash          = string & { readonly __brand: 'NpmInstallManifestHash' }
export type ProvisioningJournalSemanticHash = string & { readonly __brand: 'ProvisioningJournalSemanticHash' }
export type ProvisioningAuditJournalHash    = string & { readonly __brand: 'ProvisioningAuditJournalHash' }
export type ProvisioningDiagnosticId        = string & { readonly __brand: 'ProvisioningDiagnosticId' }
export type ProvisioningDiagnosticCode      = string & { readonly __brand: 'ProvisioningDiagnosticCode' }
export type WorkspaceRelativePath           = string & { readonly __brand: 'WorkspaceRelativePath' }
export type StagingRelativePath             = string & { readonly __brand: 'StagingRelativePath' }
export type QuarantinePath                  = string & { readonly __brand: 'QuarantinePath' }
export type PackageRelativePath             = string & { readonly __brand: 'PackageRelativePath' }
export type WorkspaceRoot                   = string & { readonly __brand: 'WorkspaceRoot' }
export type ProviderRegistryPointer         = string & { readonly __brand: 'ProviderRegistryPointer' }
export type PackageStoreLocation            = string & { readonly __brand: 'PackageStoreLocation' }

// ── Lifecycle states ──────────────────────────────────────────────────────────
export type ProvisioningExecutionState =
  | 'planned' | 'authorization-validating' | 'preflight-compiling'
  | 'observing' | 'executing' | 'compensating'
  | 'completed' | 'completed-with-pending-configuration'
  | 'failed' | 'rolled-back' | 'rollback-failed'

export type ProvisioningActionState =
  | 'pending' | 'blocked' | 'running' | 'succeeded'
  | 'configuration-required' | 'failed'
  | 'compensated' | 'compensation-failed' | 'skipped'

export type ProvisionedProviderState =
  | 'installed-inactive' | 'configuration-required' | 'validation-failed'
  | 'activation-failed' | 'ready' | 'rolled-back' | 'quarantined'

export type ProvisioningMode = 'managed' | 'observed' | 'immutable'

// ── Drift codes ───────────────────────────────────────────────────────────────
export type ProvisioningDriftCode =
  | 'LOCKFILE_HASH_MISMATCH' | 'PACKAGE_MISSING' | 'PACKAGE_UNEXPECTED'
  | 'PACKAGE_VERSION_MISMATCH' | 'PACKAGE_INTEGRITY_MISMATCH'
  | 'MODEL_MISSING' | 'MODEL_INTEGRITY_MISMATCH'
  | 'PROVIDER_REGISTRY_MISMATCH' | 'INFRASTRUCTURE_STATE_MISMATCH'

// ── Artifact types ────────────────────────────────────────────────────────────
export type AuthorizedArtifactDigest =
  | { readonly algorithm: 'sha256'; readonly encoding: 'hex'; readonly value: string }
  | { readonly algorithm: 'sha512'; readonly encoding: 'sri-base64'; readonly value: string }

// Diagnostic prefix encoding matches digest encoding (first 8 chars in native encoding)
export type DigestPrefix = string & { readonly __brand: 'DigestPrefix' }

export type AuthorizedArtifactSource =
  | { readonly sourceKind: 'uri'; readonly uri: string }
  | { readonly sourceKind: 'registry'; readonly registryId: string; readonly artifactLocator: string }
  | { readonly sourceKind: 'workspace-artifact'; readonly path: WorkspaceRelativePath }

export type AuthorizedArtifactIdentity =
  | { readonly kind: 'rohinik-package'; readonly packageId: PackageId; readonly version: string }
  | { readonly kind: 'language-package'; readonly ecosystem: string; readonly name: string; readonly version: string }
  | { readonly kind: 'model-artifact'; readonly registryId: string; readonly modelId: string; readonly version: string }
  | { readonly kind: 'adapter'; readonly adapterId: string; readonly version: string }

export interface VerifiedArtifactAuthorization {
  readonly artifactAuthorizationId: ArtifactAuthorizationId
  readonly artifact: AuthorizedArtifactIdentity
  readonly digest: AuthorizedArtifactDigest
  readonly source: AuthorizedArtifactSource
  readonly authorizedBy: AuthorizationId
}

// ── Quarantine types ──────────────────────────────────────────────────────────
export interface QuarantineWriteHandle {
  readonly quarantinePath: QuarantinePath
  readonly artifactAuthorizationId: ArtifactAuthorizationId
}

export interface QuarantinedArtifactHandle {
  readonly quarantinePath: QuarantinePath
  readonly artifactAuthorizationId: ArtifactAuthorizationId
}

export type QuarantineRetentionPolicy =
  | 'delete-on-validation-failure'
  | 'retain-until-cleanup'

export interface QuarantinedArtifactRecord {
  readonly diagnosticId: ProvisioningDiagnosticId
  readonly artifactAuthorizationId: ArtifactAuthorizationId
  readonly quarantineHandle: QuarantinedArtifactHandle
  readonly reason: 'digest-mismatch' | 'fetch-failure'
  readonly retentionPolicy: QuarantineRetentionPolicy
  readonly quarantinedAt: IsoTimestamp
}

// ── Digest match result ───────────────────────────────────────────────────────
export type ArtifactMatchResult =
  | { readonly matched: true }
  | {
      readonly matched: false
      readonly diagnosticId: ProvisioningDiagnosticId
      readonly expectedDigestPrefix: DigestPrefix
      readonly computedDigestPrefix: DigestPrefix
    }

// ── Fetch result ──────────────────────────────────────────────────────────────
export interface FetchResult {
  readonly bytesWritten: number
  readonly quarantineHandle: QuarantinedArtifactHandle
  readonly effectiveSource: AuthorizedArtifactSource
}

// ── Validation probe ──────────────────────────────────────────────────────────
export type AuthorizedValidationProbe =
  | { readonly kind: 'manifest-check' }
  | { readonly kind: 'entrypoint-exists'; readonly entrypoint: PackageRelativePath }

// ── Provider activation target ────────────────────────────────────────────────
export interface ProviderActivationTarget {
  readonly providerId: string
  readonly packageId: PackageId
  readonly version: string
  readonly capabilityIds: readonly CapabilityId[]
  readonly activationMode: 'new' | 'replace-current'
  readonly previousRegistryPointer?: ProviderRegistryPointer
}

// ── Configuration template ────────────────────────────────────────────────────
export interface AuthorizedConfigurationTemplate {
  readonly templateId: string
  readonly configurationKey: string
  readonly destination: WorkspaceRelativePath
  readonly valueType: 'string' | 'number' | 'boolean' | 'json'
  readonly canonicalContent: string
  readonly contentSemanticHash: string
  readonly writePolicy: ConfigurationWritePolicy
}

export type ConfigurationWritePolicy =
  | 'create-if-absent'
  | 'replace-authorized-generated-file'
  | 'validate-only'

// ── Secret requirement ────────────────────────────────────────────────────────
export interface AuthorizedSecretRequirement {
  readonly requirementId: string
  readonly providerId: string
  readonly secretName: string
  readonly required: boolean
}

// ── Infrastructure compensation ───────────────────────────────────────────────
export type InfrastructureCompensation =
  | { readonly kind: 'none'; readonly reason: 'reuse-existing' }
  | { readonly kind: 'stop-process'; readonly processIdentityStrategy: string }
  | { readonly kind: 'remove-generated-state'; readonly path: WorkspaceRelativePath }
  | { readonly kind: 'composite'; readonly actions: readonly InfrastructureCompensation[] }

// ── Authorization proof ───────────────────────────────────────────────────────
export interface InProcessAuthorizationProof {
  readonly algorithm: 'in-process-token'
  readonly issuer: AuthorizationIssuerId
  readonly signedPayloadHash: AuthorizedPlanSemanticHash
  readonly token: string
}

export interface Ed25519AuthorizationProof {
  readonly algorithm: 'ed25519'
  readonly issuer: AuthorizationIssuerId
  readonly keyId: string
  readonly signedPayloadHash: AuthorizedPlanSemanticHash
  readonly signatureEncoding: 'base64'
  readonly signature: string
}

export type AuthorizationProof =
  | InProcessAuthorizationProof
  | Ed25519AuthorizationProof

// ── Permission authorization ──────────────────────────────────────────────────
export interface PermissionAuthorization {
  readonly permissionName: string
  readonly authorizedFor: string
  readonly authorizationId: AuthorizationId
  readonly authorizationDecisionId: AuthorizationDecisionId
  readonly scope: string
  readonly effect: 'allow'
}

// ── Mutation policy and compensation ─────────────────────────────────────────
export interface AuthorizedCompensationDefinition {
  readonly kind: string
  readonly parameters: Readonly<Record<string, string | number | boolean>>
}

export type MutationPolicy =
  | { readonly mutating: false }
  | { readonly mutating: true; readonly compensation: AuthorizedCompensationDefinition | { readonly kind: 'non-compensable'; readonly approvedReasonCode: string } }

// ── Action base and discriminated union ───────────────────────────────────────
export interface AuthorizedActionBase {
  readonly actionId: ProvisioningActionId
  readonly dependsOn: readonly ProvisioningActionId[]
  readonly authorization: ActionAuthorizationReference
  readonly mutationPolicy: MutationPolicy
}

export interface ActionAuthorizationReference {
  readonly authorizationId: AuthorizationId
  readonly authorizationDecisionId: AuthorizationDecisionId
  readonly authorizedTargetHash: string
}

export interface AuthorizedFetchArtifactAction extends AuthorizedActionBase {
  readonly kind: 'fetch-artifact'
  readonly artifactAuthorizationId: ArtifactAuthorizationId
  readonly quarantineRetentionPolicy: QuarantineRetentionPolicy
  readonly mutationPolicy: { readonly mutating: true; readonly compensation: AuthorizedCompensationDefinition }
}

export interface AuthorizedInstallRohinikPackageAction extends AuthorizedActionBase {
  readonly kind: 'install-rohinik-package'
  readonly packageId: PackageId
  readonly version: string
  readonly artifactAuthorizationId: ArtifactAuthorizationId
  readonly destination: PackageStoreLocation
  readonly quarantineRetentionPolicy: QuarantineRetentionPolicy
  readonly mutationPolicy: { readonly mutating: true; readonly compensation: AuthorizedCompensationDefinition }
}

export type NpmExistingNodeModulesPolicy =
  | 'require-absent'
  | 'require-rohinik-managed'

export interface AuthorizedInstallLanguagePackagesAction extends AuthorizedActionBase {
  readonly kind: 'install-language-package'
  readonly ecosystem: 'npm'
  readonly npmManifestHash: NpmInstallManifestHash
  readonly existingNodeModulesPolicy: NpmExistingNodeModulesPolicy
  readonly mutationPolicy: { readonly mutating: true; readonly compensation: AuthorizedCompensationDefinition }
}

export interface AuthorizedInstallModelArtifactAction extends AuthorizedActionBase {
  readonly kind: 'install-model-artifact'
  readonly modelId: string
  readonly version: string
  readonly artifactAuthorizationId: ArtifactAuthorizationId
  readonly mutationPolicy: { readonly mutating: true; readonly compensation: AuthorizedCompensationDefinition }
}

export interface AuthorizedProvisionInfrastructureAction extends AuthorizedActionBase {
  readonly kind: 'provision-infrastructure'
  readonly serviceId: string
  readonly serviceType: string
  readonly strategy: 'reuse-existing' | 'provision-embedded' | 'provision-local-process'
  readonly infrastructureCompensation: InfrastructureCompensation
}

export interface AuthorizedApplyConfigurationAction extends AuthorizedActionBase {
  readonly kind: 'apply-configuration-template'
  readonly template: AuthorizedConfigurationTemplate
  readonly secretRequirements: readonly AuthorizedSecretRequirement[]
  // mutationPolicy: mutating:false for validate-only; mutating:true + compensation for create/replace
  // Preflight enforces this invariant
}

export interface AuthorizedRegisterProviderAction extends AuthorizedActionBase {
  readonly kind: 'register-provider'
  readonly providerId: string
  readonly packageId: PackageId
  readonly packageVersion: string
  readonly capabilityIds: readonly CapabilityId[]
  readonly mutationPolicy: { readonly mutating: true; readonly compensation: AuthorizedCompensationDefinition }
}

export interface AuthorizedValidateProviderAction extends AuthorizedActionBase {
  readonly kind: 'validate-provider'
  readonly providerId: string
  readonly probe: AuthorizedValidationProbe
  readonly mutationPolicy: { readonly mutating: false }
}

export interface AuthorizedActivateProviderAction extends AuthorizedActionBase {
  readonly kind: 'activate-provider'
  readonly activation: ProviderActivationTarget
  readonly mutationPolicy: { readonly mutating: true; readonly compensation: AuthorizedCompensationDefinition }
}

export type AuthorizedProvisioningAction =
  | AuthorizedFetchArtifactAction
  | AuthorizedInstallRohinikPackageAction
  | AuthorizedInstallLanguagePackagesAction
  | AuthorizedInstallModelArtifactAction
  | AuthorizedProvisionInfrastructureAction
  | AuthorizedApplyConfigurationAction
  | AuthorizedRegisterProviderAction
  | AuthorizedValidateProviderAction
  | AuthorizedActivateProviderAction

// ── npm manifest ──────────────────────────────────────────────────────────────
export interface AuthorizedNpmInstallManifest {
  readonly ecosystem: 'npm'
  readonly lockfileVersion: 3
  readonly packageJsonCanonicalContent: string
  readonly packageJsonSemanticHash: string
  readonly packageLockCanonicalContent: string
  readonly packageLockSemanticHash: string
  readonly packageRecords: readonly AuthorizedNpmPackageRecord[]
  readonly semanticHash: NpmInstallManifestHash
}

export type NpmPackageDisposition =
  | 'installed'
  | 'optional-platform-dependent'
  | 'link'
  | 'root'

export interface AuthorizedNpmPackageRecord {
  readonly packagePath: string
  readonly name: string
  readonly version: string
  readonly resolvedArtifact: AuthorizedArtifactSource
  readonly integrity: AuthorizedArtifactDigest
  readonly optional: boolean
  readonly dev: boolean
  readonly expectedDisposition: NpmPackageDisposition
}

// ── Authorized plan ───────────────────────────────────────────────────────────
export interface AuthorizedCapabilityResolutionPlan {
  readonly kind: 'authorized-capability-resolution-plan'
  readonly schemaVersion: 1
  readonly authorizationId: AuthorizationId
  readonly proposedPlanId: ResolutionPlanId
  readonly proposedPlanSemanticHash: ResolutionPlanSemanticHash
  readonly authorizedAt: IsoTimestamp
  readonly authorizationPolicyId: string
  readonly authorizedActions: readonly AuthorizedProvisioningAction[]
  readonly verifiedArtifacts: readonly VerifiedArtifactAuthorization[]
  readonly permissionAuthorizations: readonly PermissionAuthorization[]
  readonly npmInstallManifests: readonly AuthorizedNpmInstallManifest[]
  readonly secretRequirements: readonly AuthorizedSecretRequirement[]
  readonly semanticHash: AuthorizedPlanSemanticHash
  readonly authorizationProof: AuthorizationProof
}

// ── Append-only journal ───────────────────────────────────────────────────────
export type ProvisioningJournalEntry =
  | MutationPreparedEntry
  | MutationStartedEntry
  | MutationSucceededEntry
  | MutationFailedEntry
  | ValidationStartedEntry
  | ValidationSucceededEntry
  | ValidationFailedEntry
  | CompensationStartedEntry
  | CompensationSucceededEntry
  | CompensationFailedEntry

export interface JournalEntryBase {
  readonly executionId: ProvisioningExecutionId
  readonly planId: ResolutionPlanId
  readonly authorizationId: AuthorizationId
  readonly sequence: number
  readonly actionId: ProvisioningActionId
  readonly mutationId: ProvisioningMutationId
  readonly occurredAt: IsoTimestamp
}

export interface MutationPreparedEntry extends JournalEntryBase {
  readonly event: 'mutation-prepared'
  readonly operation: ProvisioningOperation
  readonly compensationClassification: AuthorizedCompensationDefinition | { readonly kind: 'non-compensable'; readonly approvedReasonCode: string }
}
export interface MutationStartedEntry extends JournalEntryBase {
  readonly event: 'mutation-started'
  readonly operation: ProvisioningOperation
}
export interface MutationSucceededEntry extends JournalEntryBase {
  readonly event: 'mutation-succeeded'
  readonly operation: ProvisioningOperation
  readonly instantiatedCompensation?: InstantiatedCompensationRecord
}
export interface MutationFailedEntry extends JournalEntryBase {
  readonly event: 'mutation-failed'
  readonly operation: ProvisioningOperation
  readonly diagnosticCodes: readonly ProvisioningDiagnosticCode[]
  readonly diagnosticIds: readonly ProvisioningDiagnosticId[]
}
export interface ValidationStartedEntry extends JournalEntryBase {
  readonly event: 'validation-started'
  readonly validationKind: string
}
export interface ValidationSucceededEntry extends JournalEntryBase {
  readonly event: 'validation-succeeded'
  readonly validationKind: string
}
export interface ValidationFailedEntry extends JournalEntryBase {
  readonly event: 'validation-failed'
  readonly validationKind: string
  readonly diagnosticCodes: readonly ProvisioningDiagnosticCode[]
  readonly diagnosticIds: readonly ProvisioningDiagnosticId[]
  readonly quarantinedArtifactRecord?: QuarantinedArtifactRecord
}
export interface CompensationStartedEntry extends JournalEntryBase {
  readonly event: 'compensation-started'
  readonly operation: ProvisioningOperation
}
export interface CompensationSucceededEntry extends JournalEntryBase {
  readonly event: 'compensation-succeeded'
  readonly operation: ProvisioningOperation
}
export interface CompensationFailedEntry extends JournalEntryBase {
  readonly event: 'compensation-failed'
  readonly operation: ProvisioningOperation
  readonly diagnosticCodes: readonly ProvisioningDiagnosticCode[]
}

export interface ProvisioningOperation {
  readonly kind: AuthorizedProvisioningAction['kind']
  readonly targetId: string
}

export interface InstantiatedCompensationRecord {
  readonly kind: string
  readonly parameters: Readonly<Record<string, string | number | boolean>>
}

export interface ProvisioningJournal {
  readonly executionId: ProvisioningExecutionId
  readonly planId: ResolutionPlanId
  readonly authorizationId: AuthorizationId
  readonly entries: readonly ProvisioningJournalEntry[]
  readonly semanticJournalHash: ProvisioningJournalSemanticHash
  readonly auditJournalHash: ProvisioningAuditJournalHash
}

// ── Workspace ─────────────────────────────────────────────────────────────────
export interface ProvisioningWorkspace {
  readonly workspaceId: string
  readonly root: WorkspaceRoot
  readonly quarantineRoot: WorkspaceRelativePath
  readonly stagingRoot: WorkspaceRelativePath
  readonly packageStoreRoot: WorkspaceRelativePath
  readonly modelStoreRoot: WorkspaceRelativePath
}

// ── Environment snapshot ──────────────────────────────────────────────────────
export interface ProvisioningEnvironmentSnapshot {
  readonly os: string
  readonly architecture: string
  readonly libc?: string
  readonly nodeVersion?: string
  readonly nodeAbi?: string
  readonly npmVersion?: string
}

// ── Result types ──────────────────────────────────────────────────────────────
export interface ProvisioningActionResult {
  readonly actionId: ProvisioningActionId
  readonly state: ProvisioningActionState
  readonly diagnosticCodes: readonly ProvisioningDiagnosticCode[]
  readonly diagnosticIds: readonly ProvisioningDiagnosticId[]
  readonly durationMs?: number
}

export interface ProviderProvisioningResult {
  readonly providerId: string
  readonly packageId: PackageId
  readonly version: string
  readonly state: ProvisionedProviderState
  readonly missingConfigurationKeys?: readonly string[]
}

export interface CompensationResult {
  readonly succeeded: boolean
  readonly diagnosticCodes: readonly ProvisioningDiagnosticCode[]
}

export interface ManagedProvisioningResult {
  readonly mode: 'managed'
  readonly executionId: ProvisioningExecutionId
  readonly authorizationId: AuthorizationId
  readonly planId: ResolutionPlanId
  readonly status: 'success' | 'configuration-required' | 'failed' | 'rolled-back' | 'rollback-failed'
  readonly actionResults: readonly ProvisioningActionResult[]
  readonly providers: readonly ProviderProvisioningResult[]
  readonly semanticJournalHash: ProvisioningJournalSemanticHash
  readonly auditJournalHash: ProvisioningAuditJournalHash
  readonly startedAt: IsoTimestamp
  readonly completedAt: IsoTimestamp
}

export interface ObservedProvisioningResult {
  readonly mode: 'observed'
  readonly executionId: ProvisioningExecutionId
  readonly authorizationId: AuthorizationId
  readonly planId: ResolutionPlanId
  readonly expectedMutations: readonly string[]
  readonly warnings: readonly string[]
}

export interface ImmutableProvisioningResult {
  readonly mode: 'immutable'
  readonly executionId: ProvisioningExecutionId
  readonly authorizationId: AuthorizationId
  readonly planId: ResolutionPlanId
  readonly status: 'compliant' | 'drift-detected'
  readonly driftItems: readonly ProvisioningDriftItem[]
}

export interface ProvisioningDriftItem {
  readonly code: ProvisioningDriftCode
  readonly target: string
  readonly detail: string
}

export type ProvisioningExecutionResult =
  | ManagedProvisioningResult
  | ObservedProvisioningResult
  | ImmutableProvisioningResult

// ── Port interfaces ───────────────────────────────────────────────────────────
export interface ArtifactFetchPort {
  fetch(source: AuthorizedArtifactSource, destination: QuarantineWriteHandle): Promise<FetchResult>
}

export interface ArtifactDigestMatchPort {
  matchStream(input: AsyncIterable<Uint8Array>, authorization: VerifiedArtifactAuthorization): Promise<ArtifactMatchResult>
  matchFile(handle: QuarantinedArtifactHandle, authorization: VerifiedArtifactAuthorization): Promise<ArtifactMatchResult>
}

export interface PackageInstallPort {
  install(
    action: AuthorizedInstallRohinikPackageAction,
    authorization: VerifiedArtifactAuthorization,
    workspace: ProvisioningWorkspace,
    journal: MutationJournalPort,
  ): Promise<PackageInstallResult>
}

export interface PackageInstallResult {
  readonly installedPath: PackageStoreLocation
  readonly quarantineRecord?: QuarantinedArtifactRecord
}

export interface LanguageDependencyObservePort {
  observe(manifest: AuthorizedNpmInstallManifest, workspace: ProvisioningWorkspace): Promise<LanguageDependencyObservation>
}

export interface LanguageDependencyApplyPort {
  apply(
    manifest: AuthorizedNpmInstallManifest,
    workspace: ProvisioningWorkspace,
    journal: MutationJournalPort,
  ): Promise<LanguageDependencyExecutionResult>
}

export interface LanguageDependencyInspectPort {
  inspect(manifest: AuthorizedNpmInstallManifest, workspace: ProvisioningWorkspace): Promise<LanguageDependencyComplianceResult>
  compensate(executionId: ProvisioningExecutionId, workspace: ProvisioningWorkspace): Promise<CompensationResult>
}

// Passed to installers so they journal their own mutation phases
export interface MutationJournalPort {
  prepareMutation(actionId: ProvisioningActionId, mutationId: ProvisioningMutationId, operation: ProvisioningOperation, classification: AuthorizedCompensationDefinition | { kind: 'non-compensable'; approvedReasonCode: string }): void
  startMutation(actionId: ProvisioningActionId, mutationId: ProvisioningMutationId, operation: ProvisioningOperation): void
  recordSuccess(actionId: ProvisioningActionId, mutationId: ProvisioningMutationId, operation: ProvisioningOperation, instantiatedCompensation?: InstantiatedCompensationRecord): void
  recordFailure(actionId: ProvisioningActionId, mutationId: ProvisioningMutationId, operation: ProvisioningOperation, codes: readonly ProvisioningDiagnosticCode[], ids: readonly ProvisioningDiagnosticId[]): void
  recordValidationStarted(actionId: ProvisioningActionId, mutationId: ProvisioningMutationId, validationKind: string): void
  recordValidationSucceeded(actionId: ProvisioningActionId, mutationId: ProvisioningMutationId, validationKind: string): void
  recordValidationFailed(actionId: ProvisioningActionId, mutationId: ProvisioningMutationId, validationKind: string, codes: readonly ProvisioningDiagnosticCode[], ids: readonly ProvisioningDiagnosticId[], quarantineRecord?: QuarantinedArtifactRecord): void
}

// Auth resolver for ed25519 (injected — production wires real key store)
export interface AuthorizationKeyResolver {
  resolveEd25519PublicKey(issuer: AuthorizationIssuerId, keyId: string): Promise<string | Uint8Array | undefined>
}

export interface InstalledProviderHandle {
  readonly providerId: string
  readonly packageId: PackageId
  readonly version: string
  readonly installPath: WorkspaceRelativePath
}

export interface ProviderValidationResult {
  readonly passed: boolean
  readonly diagnosticCodes: readonly ProvisioningDiagnosticCode[]
}

export interface LanguageDependencyObservation {
  readonly ecosystem: string
  readonly expectedInstallCount: number
  readonly expectedMutations: readonly string[]
}

export interface LanguageDependencyExecutionResult {
  readonly ecosystem: string
  readonly installedCount: number
  readonly durationMs: number
}

export interface LanguageDependencyComplianceResult {
  readonly compliant: boolean
  readonly driftItems: readonly ProvisioningDriftItem[]
}

export interface SecretPresenceReader {
  has(secretName: string): Promise<boolean>
}

export interface SecretReadinessResult {
  readonly allPresent: boolean
  readonly missingSecretNames: readonly string[]
}

export interface ConfigurationApplicationResult {
  readonly applied: readonly string[]
  readonly skipped: readonly string[]
  readonly failed: readonly string[]
}

export interface Clock {
  now(): IsoTimestamp
}

// ── Typed error classes ───────────────────────────────────────────────────────
export class AuthorizationValidationError extends Error {
  constructor(readonly code: 'WRONG_PLAN_TYPE' | 'SEMANTIC_HASH_MISMATCH' | 'PROOF_INVALID' | 'ISSUER_UNKNOWN' | 'SIGNATURE_INVALID', message: string) {
    super(message); this.name = 'AuthorizationValidationError'
  }
}
export class PlanStructureError extends Error {
  constructor(readonly diagnostics: readonly string[], message: string) {
    super(message); this.name = 'PlanStructureError'
  }
}
export class CyclicDependencyError extends Error {
  constructor(readonly cycle: readonly ProvisioningActionId[], message: string) {
    super(message); this.name = 'CyclicDependencyError'
  }
}
export class ArtifactDigestMismatchError extends Error {
  constructor(readonly diagnosticId: ProvisioningDiagnosticId, readonly artifactAuthorizationId: ArtifactAuthorizationId, message: string) {
    super(message); this.name = 'ArtifactDigestMismatchError'
  }
}
export class PreflightError extends Error {
  constructor(readonly diagnostics: readonly string[], message: string) {
    super(message); this.name = 'PreflightError'
  }
}
