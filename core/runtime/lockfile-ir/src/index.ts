import type { AuthorizedCapabilityResolutionPlan, ManagedProvisioningResult } from '@rohinik-org/provisioning-ir'

// ── Branded opaque types ──────────────────────────────────────────────────────

export type RohinikLockSemanticHash = string & { readonly __brand: 'RohinikLockSemanticHash' }
export type RohinikLockAuditHash = string & { readonly __brand: 'RohinikLockAuditHash' }

// ── Integrity and artifact sources ───────────────────────────────────────────

export type LockedIntegrity =
  | { readonly algorithm: 'sha256'; readonly encoding: 'hex'; readonly value: string }
  | { readonly algorithm: 'sha512'; readonly encoding: 'sri-base64'; readonly value: string }

export type LockedArtifactSource =
  | { readonly sourceKind: 'registry'; readonly registryId: string; readonly artifactLocator: string }
  | { readonly sourceKind: 'workspace-artifact'; readonly workspaceArtifactId: string; readonly relativePath: string }
  | { readonly sourceKind: 'content-addressed'; readonly storeId: string; readonly digest: LockedIntegrity }
  | { readonly sourceKind: 'authorized-uri'; readonly sourceIdentity: string; readonly effectiveOrigin?: string }

export interface LockedSignatureProvenance {
  readonly verificationStatus: 'verified'
  readonly issuer: string
  readonly keyId?: string
  readonly signatureAlgorithm: string
  readonly signedArtifactDigest: LockedIntegrity
}

// ── Application ───────────────────────────────────────────────────────────────

export interface LockedApplication {
  readonly applicationId: string
  readonly manifestSemanticHash: string
  readonly manifestSchemaVersion: number
}

// ── Runtime environment ───────────────────────────────────────────────────────

export interface LockedRuntimeEnvironment {
  readonly os: string
  readonly architecture: string
  readonly libc?: string
  readonly runtimeKind: 'nodejs'
  readonly runtimeVersion: string
  readonly runtimeAbi?: string
  readonly packageManager?: {
    readonly kind: 'npm'
    readonly version: string
  }
}

// ── Resolution provenance ─────────────────────────────────────────────────────

export interface LockedCatalogSnapshot {
  readonly catalogId: string
  readonly snapshotSemanticHash: string
}

export interface LockedResolutionProvenance {
  readonly proposedPlanId: string
  readonly proposedPlanSemanticHash: string
  readonly authorizedPlanSemanticHash: string
  readonly authorizationId: string
  readonly resolverIdentity: {
    readonly implementationId: string
    readonly version: string
  }
  readonly resolutionPolicySemanticHash: string
  readonly catalogSnapshots: readonly LockedCatalogSnapshot[]
}

// ── Capability bindings ───────────────────────────────────────────────────────

export interface LockedCapabilityBinding {
  readonly capabilityId: string
  readonly requirement: {
    readonly requestedVersionRange?: string
    readonly contractSemanticHash?: string
  }
  readonly resolvedContractVersion: string
  readonly providerId: string
  readonly providerVersion: string
  readonly packageId: string
  readonly packageVersion: string
  readonly selectionReasonCode?: string
}

// ── Packages ──────────────────────────────────────────────────────────────────

export interface LockedPackage {
  readonly packageId: string
  readonly version: string
  readonly integrity: LockedIntegrity
  readonly source: LockedArtifactSource
  readonly packageStoreIdentity: {
    readonly contentAddress?: string
    readonly relativeLocation?: string
  }
  readonly signatureProvenance?: LockedSignatureProvenance
}

// ── Language dependencies (npm) ───────────────────────────────────────────────

export interface LockedNpmPackage {
  readonly packagePath: string
  readonly name: string
  readonly version: string
  readonly integrity?: LockedIntegrity
  readonly source?: LockedArtifactSource
  readonly disposition: 'installed' | 'optional-platform-dependent' | 'link' | 'root'
  readonly optional: boolean
  readonly dev: boolean
}

export interface LockedNpmEnvironment {
  readonly packageJsonSemanticHash: string
  readonly packageLockSemanticHash: string
  readonly lockfileVersion: 3
  readonly nodeVersion: string
  readonly npmVersion: string
  readonly packages: readonly LockedNpmPackage[]
}

export interface LockedLanguageDependencies {
  readonly npm?: LockedNpmEnvironment
}

// ── Models ────────────────────────────────────────────────────────────────────

export interface LockedModelFile {
  readonly relativePath: string
  readonly sizeBytes?: number
  readonly integrity: LockedIntegrity
}

export interface LockedModelArtifact {
  readonly modelId: string
  readonly version: string
  readonly format?: string
  readonly integrity: LockedIntegrity
  readonly source: LockedArtifactSource
  readonly files?: readonly LockedModelFile[]
}

// ── Infrastructure ────────────────────────────────────────────────────────────

export interface LockedInfrastructure {
  readonly serviceId: string
  readonly serviceType: string
  readonly strategy: 'reuse-existing' | 'provision-embedded' | 'provision-local-process'
  readonly implementationIdentity?: string
  readonly implementationVersion?: string
  readonly configurationSemanticHash?: string
  readonly observedIdentity?: string
}

// ── Providers ─────────────────────────────────────────────────────────────────

export interface LockedValidationEvidence {
  readonly probeKind: 'manifest-check' | 'entrypoint-exists'
  readonly passed: true
}

export interface LockedProvider {
  readonly providerId: string
  readonly version: string
  readonly packageId: string
  readonly packageVersion: string
  readonly state: 'ready'
  readonly registryPointer: string
  readonly capabilityIds: readonly string[]
  readonly validationEvidence: readonly LockedValidationEvidence[]
}

// ── Configuration ─────────────────────────────────────────────────────────────

export interface LockedConfigurationRecord {
  readonly configurationKey: string
  readonly templateId: string
  readonly destination: string
  readonly contentSemanticHash: string
  readonly writePolicy: 'create-if-absent' | 'replace-authorized-generated-file' | 'validate-only'
  readonly requiredSecretNames: readonly string[]
}

// ── Policies ──────────────────────────────────────────────────────────────────

export interface LockedPolicyProvenance {
  readonly trustPolicySemanticHash: string
  readonly permissionPolicySemanticHash: string
  readonly authorizationPolicySemanticHash: string
}

// ── Audit metadata ────────────────────────────────────────────────────────────

export interface LockfileAuditMetadata {
  readonly generatedAt: string
  readonly generatedBy: {
    readonly implementationId: string
    readonly version: string
  }
  readonly provisioningExecutionId: string
  readonly provisioningSemanticJournalHash: string
  readonly provisioningAuditJournalHash?: string
}

export interface LockfileAuditInput {
  readonly generatedAt: string
  readonly generatedBy: {
    readonly implementationId: string
    readonly version: string
  }
  readonly provisioningExecutionId: string
  readonly provisioningSemanticJournalHash: string
  readonly provisioningAuditJournalHash?: string
}

// ── Lock extension ────────────────────────────────────────────────────────────

export interface LockExtension {
  readonly namespace: string
  readonly semanticHash: string
}

// ── Root lockfile schema ──────────────────────────────────────────────────────

export interface RohinikLockfileV1 {
  readonly kind: 'rohinik-lockfile'
  readonly lockVersion: 1
  readonly application: LockedApplication
  readonly runtime: LockedRuntimeEnvironment
  readonly resolution: LockedResolutionProvenance
  readonly capabilities: readonly LockedCapabilityBinding[]
  readonly packages: readonly LockedPackage[]
  readonly dependencies: LockedLanguageDependencies
  readonly models: readonly LockedModelArtifact[]
  readonly infrastructure: readonly LockedInfrastructure[]
  readonly providers: readonly LockedProvider[]
  readonly configuration: readonly LockedConfigurationRecord[]
  readonly policies: LockedPolicyProvenance
  readonly semanticHash: RohinikLockSemanticHash
  readonly audit: LockfileAuditMetadata
  readonly auditHash: RohinikLockAuditHash
  readonly extensions?: readonly LockExtension[]
}

export type SupportedLockVersion = 1

// ── Delivered environment snapshot ───────────────────────────────────────────

export interface DeliveredApplicationSnapshot {
  readonly applicationId: string
  readonly manifestSemanticHash: string
  readonly manifestSchemaVersion: number
}

export interface DeliveredRuntimeSnapshot {
  readonly os: string
  readonly architecture: string
  readonly libc?: string
  readonly runtimeKind: 'nodejs'
  readonly runtimeVersion: string
  readonly runtimeAbi?: string
  readonly packageManager?: {
    readonly kind: 'npm'
    readonly version: string
  }
}

export interface DeliveredResolutionSnapshot {
  readonly proposedPlanId: string
  readonly proposedPlanSemanticHash: string
  readonly authorizedPlanSemanticHash: string
  readonly authorizationId: string
  readonly resolverIdentity: {
    readonly implementationId: string
    readonly version: string
  }
  readonly resolutionPolicySemanticHash: string
  readonly catalogSnapshots: readonly LockedCatalogSnapshot[]
}

export interface DeliveredCapabilityBinding {
  readonly capabilityId: string
  readonly requirement: {
    readonly requestedVersionRange?: string
    readonly contractSemanticHash?: string
  }
  readonly resolvedContractVersion: string
  readonly providerId: string
  readonly providerVersion: string
  readonly packageId: string
  readonly packageVersion: string
  readonly selectionReasonCode?: string
}

export interface DeliveredPackage {
  readonly packageId: string
  readonly version: string
  readonly integrity: LockedIntegrity
  readonly source: LockedArtifactSource
  readonly packageStoreIdentity: {
    readonly contentAddress?: string
    readonly relativeLocation?: string
  }
  readonly signatureProvenance?: LockedSignatureProvenance
}

export interface DeliveredNpmPackage {
  readonly packagePath: string
  readonly name: string
  readonly version: string
  readonly integrity?: LockedIntegrity
  readonly source?: LockedArtifactSource
  readonly disposition: 'installed' | 'optional-platform-dependent' | 'link' | 'root'
  readonly optional: boolean
  readonly dev: boolean
}

export interface DeliveredNpmEnvironment {
  readonly packageJsonSemanticHash: string
  readonly packageLockSemanticHash: string
  readonly lockfileVersion: 3
  readonly nodeVersion: string
  readonly npmVersion: string
  readonly packages: readonly DeliveredNpmPackage[]
}

export interface DeliveredDependencySnapshot {
  readonly npm?: DeliveredNpmEnvironment
}

export interface DeliveredModel {
  readonly modelId: string
  readonly version: string
  readonly format?: string
  readonly integrity: LockedIntegrity
  readonly source: LockedArtifactSource
  readonly files?: readonly LockedModelFile[]
}

export interface DeliveredInfrastructure {
  readonly serviceId: string
  readonly serviceType: string
  readonly strategy: 'reuse-existing' | 'provision-embedded' | 'provision-local-process'
  readonly implementationIdentity?: string
  readonly implementationVersion?: string
  readonly configurationSemanticHash?: string
  readonly observedIdentity?: string
}

export interface DeliveredProvider {
  readonly providerId: string
  readonly version: string
  readonly packageId: string
  readonly packageVersion: string
  readonly state: 'ready'
  readonly registryPointer: string
  readonly capabilityIds: readonly string[]
  readonly validationEvidence: readonly LockedValidationEvidence[]
}

export interface DeliveredConfiguration {
  readonly configurationKey: string
  readonly templateId: string
  readonly destination: string
  readonly contentSemanticHash: string
  readonly writePolicy: 'create-if-absent' | 'replace-authorized-generated-file' | 'validate-only'
  readonly requiredSecretNames: readonly string[]
}

export interface DeliveredPolicySnapshot {
  readonly trustPolicySemanticHash: string
  readonly permissionPolicySemanticHash: string
  readonly authorizationPolicySemanticHash: string
}

export interface DeliveredEnvironmentSnapshot {
  readonly kind: 'delivered-environment-snapshot'
  readonly snapshotVersion: 1
  readonly application: DeliveredApplicationSnapshot
  readonly runtime: DeliveredRuntimeSnapshot
  readonly resolution: DeliveredResolutionSnapshot
  readonly capabilities: readonly DeliveredCapabilityBinding[]
  readonly packages: readonly DeliveredPackage[]
  readonly dependencies: DeliveredDependencySnapshot
  readonly models: readonly DeliveredModel[]
  readonly infrastructure: readonly DeliveredInfrastructure[]
  readonly providers: readonly DeliveredProvider[]
  readonly configuration: readonly DeliveredConfiguration[]
  readonly policies: DeliveredPolicySnapshot
  readonly provisioningEvidence: {
    readonly executionId: string
    readonly status: 'success'
    readonly semanticJournalHash: string
    readonly auditJournalHash?: string
  }
}

// ── Observed environment snapshot ────────────────────────────────────────────

export interface ObservedApplication {
  readonly applicationId?: string
  readonly manifestSemanticHash?: string
  readonly manifestSchemaVersion?: number
}

export interface ObservedRuntime {
  readonly os?: string
  readonly architecture?: string
  readonly libc?: string
  readonly runtimeKind?: 'nodejs'
  readonly runtimeVersion?: string
  readonly runtimeAbi?: string
  readonly packageManager?: {
    readonly kind: 'npm'
    readonly version: string
  }
}

export interface ObservedCapabilityBinding {
  readonly capabilityId: string
  readonly requirement?: {
    readonly requestedVersionRange?: string
    readonly contractSemanticHash?: string
  }
  readonly resolvedContractVersion?: string
  readonly providerId?: string
  readonly providerVersion?: string
  readonly packageId?: string
  readonly packageVersion?: string
  readonly selectionReasonCode?: string
}

export interface ObservedPackage {
  readonly packageId: string
  readonly version?: string
  readonly integrity?: LockedIntegrity
  readonly source?: LockedArtifactSource
}

export interface ObservedNpmPackage {
  readonly packagePath: string
  readonly name?: string
  readonly version?: string
  readonly integrity?: LockedIntegrity
  readonly source?: LockedArtifactSource
  readonly disposition?: 'installed' | 'optional-platform-dependent' | 'link' | 'root'
  readonly optional?: boolean
  readonly dev?: boolean
}

export interface ObservedNpmEnvironment {
  readonly packageJsonSemanticHash?: string
  readonly packageLockSemanticHash?: string
  readonly lockfileVersion?: number
  readonly nodeVersion?: string
  readonly npmVersion?: string
  readonly packages?: readonly ObservedNpmPackage[]
}

export interface ObservedDependencyEnvironment {
  readonly npm?: ObservedNpmEnvironment
}

export interface ObservedModel {
  readonly modelId: string
  readonly version?: string
  readonly integrity?: LockedIntegrity
}

export interface ObservedInfrastructure {
  readonly serviceId: string
  readonly serviceType?: string
  readonly strategy?: 'reuse-existing' | 'provision-embedded' | 'provision-local-process'
  readonly implementationIdentity?: string
  readonly implementationVersion?: string
  readonly configurationSemanticHash?: string
  readonly observedIdentity?: string
}

export interface ObservedProvider {
  readonly providerId: string
  readonly version?: string
  readonly packageId?: string
  readonly state?: string
  readonly registryPointer?: string
}

export interface ObservedConfiguration {
  readonly configurationKey: string
  readonly templateId?: string
  readonly destination?: string
  readonly contentSemanticHash?: string
  readonly writePolicy?: 'create-if-absent' | 'replace-authorized-generated-file' | 'validate-only'
  readonly requiredSecretNames?: readonly string[]
}

export interface ObservedPolicySnapshot {
  readonly trustPolicySemanticHash?: string
  readonly permissionPolicySemanticHash?: string
  readonly authorizationPolicySemanticHash?: string
}

export interface ObservedEnvironmentSnapshot {
  readonly kind: 'observed-environment-snapshot'
  readonly snapshotVersion: 1
  readonly application: ObservedApplication
  readonly runtime: ObservedRuntime
  readonly capabilities: readonly ObservedCapabilityBinding[]
  readonly packages: readonly ObservedPackage[]
  readonly dependencies: ObservedDependencyEnvironment
  readonly models: readonly ObservedModel[]
  readonly infrastructure: readonly ObservedInfrastructure[]
  readonly providers: readonly ObservedProvider[]
  readonly configuration: readonly ObservedConfiguration[]
  readonly policies: ObservedPolicySnapshot
}

// ── Drift types ───────────────────────────────────────────────────────────────

export type LockDriftType =
  | 'application-manifest-drift'
  | 'capability-binding-missing'
  | 'capability-binding-unexpected'
  | 'capability-provider-drift'
  | 'capability-contract-version-drift'
  | 'package-missing'
  | 'package-unexpected'
  | 'package-version-drift'
  | 'package-integrity-drift'
  | 'package-source-identity-drift'
  | 'dependency-missing'
  | 'dependency-unexpected'
  | 'dependency-version-drift'
  | 'dependency-integrity-drift'
  | 'dependency-lockfile-drift'
  | 'model-missing'
  | 'model-unexpected'
  | 'model-version-drift'
  | 'model-integrity-drift'
  | 'provider-missing'
  | 'provider-unexpected'
  | 'provider-version-drift'
  | 'provider-package-drift'
  | 'provider-registry-drift'
  | 'provider-not-ready'
  | 'runtime-version-drift'
  | 'runtime-abi-drift'
  | 'package-manager-version-drift'
  | 'platform-os-drift'
  | 'platform-architecture-drift'
  | 'platform-libc-drift'
  | 'infrastructure-missing'
  | 'infrastructure-unexpected'
  | 'infrastructure-strategy-drift'
  | 'infrastructure-identity-drift'
  | 'infrastructure-configuration-drift'
  | 'configuration-missing'
  | 'configuration-unexpected'
  | 'configuration-content-drift'
  | 'configuration-provenance-drift'
  | 'trust-policy-drift'
  | 'permission-policy-drift'
  | 'authorization-policy-drift'
  | 'unsupported-lock-version'
  | 'lock-semantic-hash-invalid'
  | 'lock-audit-hash-invalid'

export type LockEnforcementMode = 'development' | 'ci' | 'immutable'
export type DriftSeverity = 'information' | 'warning' | 'error' | 'security-error'

export interface DriftEntry {
  readonly driftType: LockDriftType
  readonly targetKind: 'application' | 'capability' | 'package' | 'dependency' | 'model' | 'provider' | 'runtime' | 'platform' | 'infrastructure' | 'configuration' | 'policy' | 'lockfile'
  readonly targetId: string
  readonly field: string
  readonly lockedValue?: string
  readonly observedValue?: string
  readonly severity: DriftSeverity
  readonly remediationCode: string
  readonly remediationHint: string
}

export interface DriftReport {
  readonly lockSemanticHash: RohinikLockSemanticHash
  readonly mode: LockEnforcementMode
  readonly status: 'compliant' | 'warning' | 'conflict' | 'security-conflict'
  readonly entries: readonly DriftEntry[]
}

// ── Enforcement policy ────────────────────────────────────────────────────────

export interface LockEnforcementPolicy {
  readonly development: {
    readonly failOnNonIntegrityDrift: boolean
  }
  readonly ci: {
    readonly requireLockfile: boolean
    readonly failOnWarning: boolean
  }
  readonly immutable: {
    readonly requireLockfile: true
    readonly permitWrites: false
    readonly permitProvisioning: false
  }
}

// ── Validation ────────────────────────────────────────────────────────────────

export interface LockfileDiagnostic {
  readonly code: string
  readonly message: string
  readonly field?: string
}

export interface LockfileValidationResult {
  readonly valid: boolean
  readonly diagnostics: readonly LockfileDiagnostic[]
}

// ── Admission ─────────────────────────────────────────────────────────────────

export type LockAdmissionDecision =
  | { readonly admitted: true; readonly status: 'compliant' | 'admitted-with-development-warnings'; readonly report: DriftReport }
  | { readonly admitted: false; readonly status: 'drift-rejected' | 'security-rejected' | 'lock-invalid'; readonly report: DriftReport }

// ── Service and port interfaces ───────────────────────────────────────────────

export interface LockfileGenerator {
  generate(snapshot: DeliveredEnvironmentSnapshot, audit: LockfileAuditInput): RohinikLockfileV1
}

export interface LockfileValidator {
  parse(input: unknown): RohinikLockfileV1
  validate(lockfile: RohinikLockfileV1): LockfileValidationResult
}

export interface LockfileStore {
  read(projectRoot: string): Promise<RohinikLockfileV1 | undefined>
  writeAtomic(projectRoot: string, lockfile: RohinikLockfileV1): Promise<void>
  readRaw(projectRoot: string): Promise<string | undefined>
}

export interface LockfileMigrator {
  readonly fromVersion: number
  readonly toVersion: number
  migrate(input: unknown): unknown
}

export interface LockDriftDetector {
  detect(locked: RohinikLockfileV1, observed: ObservedEnvironmentSnapshot, mode: LockEnforcementMode, policy?: LockEnforcementPolicy): DriftReport
}

export interface LockAdmissionController {
  admit(lockfile: RohinikLockfileV1, observed: ObservedEnvironmentSnapshot, mode: LockEnforcementMode): LockAdmissionDecision
}

export interface LockInspectionContext {
  readonly projectRoot: string
  readonly workspace: { readonly root: string }
}

export interface LockfileLifecycleService {
  generate(snapshot: DeliveredEnvironmentSnapshot, audit: LockfileAuditInput): RohinikLockfileV1
  validate(lockfile: RohinikLockfileV1): LockfileValidationResult
  inspectCurrentEnvironment(context: LockInspectionContext): Promise<ObservedEnvironmentSnapshot>
  detectDrift(locked: RohinikLockfileV1, observed: ObservedEnvironmentSnapshot, mode: LockEnforcementMode): DriftReport
  admit(locked: RohinikLockfileV1, observed: ObservedEnvironmentSnapshot, mode: LockEnforcementMode): LockAdmissionDecision
}

// ── Inspector ports ───────────────────────────────────────────────────────────

export interface ObservedRuntimeEnvironment {
  readonly os: string
  readonly architecture: string
  readonly libc?: string
  readonly runtimeKind: 'nodejs'
  readonly runtimeVersion: string
  readonly runtimeAbi?: string
  readonly packageManager?: { readonly kind: 'npm'; readonly version: string }
}

export interface PackageEnvironmentInspector {
  inspectPackages(): Promise<readonly ObservedPackage[]>
}

export interface ProviderEnvironmentInspector {
  inspectProviders(): Promise<readonly ObservedProvider[]>
}

export interface DependencyEnvironmentInspector {
  inspectDependencies(): Promise<ObservedDependencyEnvironment>
}

export interface ModelEnvironmentInspector {
  inspectModels(): Promise<readonly ObservedModel[]>
}

export interface InfrastructureEnvironmentInspector {
  inspectInfrastructure(): Promise<readonly ObservedInfrastructure[]>
}

export interface ConfigurationEnvironmentInspector {
  inspectConfiguration(): Promise<readonly ObservedConfiguration[]>
}

export interface RuntimeEnvironmentInspector {
  inspectRuntime(): Promise<ObservedRuntimeEnvironment>
}

// ── Assembly input ────────────────────────────────────────────────────────────

export interface ResolutionProvenanceInput {
  readonly proposedPlanId: string
  readonly proposedPlanSemanticHash: string
  readonly authorizedPlanSemanticHash: string
  readonly authorizationId: string
  readonly resolverIdentity: { readonly implementationId: string; readonly version: string }
  readonly resolutionPolicySemanticHash: string
  readonly catalogSnapshots: readonly { readonly catalogId: string; readonly snapshotSemanticHash: string }[]
}

export interface DeliveredEnvironmentAssemblyInput {
  readonly plan: AuthorizedCapabilityResolutionPlan
  readonly result: ManagedProvisioningResult
  readonly resolution: ResolutionProvenanceInput
}

export interface DeliveredEnvironmentSnapshotAssembler {
  assemble(input: DeliveredEnvironmentAssemblyInput): Promise<DeliveredEnvironmentSnapshot>
}

// ── Typed errors ──────────────────────────────────────────────────────────────

export class LockfileNotFoundError extends Error {
  constructor(path: string) { super(`Lockfile not found: ${path}`); this.name = 'LockfileNotFoundError' }
}
export class LockfileParseError extends Error {
  constructor(message: string) { super(message); this.name = 'LockfileParseError' }
}
export class LockfileValidationError extends Error {
  constructor(message: string) { super(message); this.name = 'LockfileValidationError' }
}
export class SnapshotAdmissionError extends Error {
  constructor(message: string) { super(message); this.name = 'SnapshotAdmissionError' }
}
export class LockWriteError extends Error {
  constructor(message: string) { super(message); this.name = 'LockWriteError' }
}
export class LockMigrationError extends Error {
  constructor(message: string) { super(message); this.name = 'LockMigrationError' }
}
