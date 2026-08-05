import type { CapabilityId, ApplicationId } from '@rohinik-org/capability-ir'
import type { CapabilityRequirementId, VersionRange, TrustLevel, IsoTimestamp, JsonValue } from '@rohinik-org/capability-contracts-ir'
import type { CapabilityRequirementSet } from '@rohinik-org/capability-contracts-ir'
import type { ResolutionConfig } from '@rohinik-org/application-manifest-ir'
export type { ResolutionConfig } from '@rohinik-org/application-manifest-ir'
export type { CapabilityRequirementSet }
export type { CapabilityId } from '@rohinik-org/capability-ir'

// Opaque ID types for Stage 9G resolution graph
export type ResolutionGraphId               = string & { readonly __brand: 'ResolutionGraphId' }
export type ResolutionGraphSemanticHash     = string & { readonly __brand: 'ResolutionGraphSemanticHash' }
export type PlatformSnapshotHash            = string & { readonly __brand: 'PlatformSnapshotHash' }
export type InstalledCapabilitySnapshotHash = string & { readonly __brand: 'InstalledCapabilitySnapshotHash' }
export type CatalogId                       = string & { readonly __brand: 'CatalogId' }
export type CatalogSnapshotHash             = string & { readonly __brand: 'CatalogSnapshotHash' }
export type ResolutionNodeId                = string & { readonly __brand: 'ResolutionNodeId' }
export type ProviderCandidateId             = string & { readonly __brand: 'ProviderCandidateId' }
export type PackageId                       = string & { readonly __brand: 'PackageId' }
export type ResolutionPlanId                = string & { readonly __brand: 'ResolutionPlanId' }
export type ResolutionPlanSemanticHash      = string & { readonly __brand: 'ResolutionPlanSemanticHash' }
export type ResolutionConflictId            = string & { readonly __brand: 'ResolutionConflictId' }
export type InstallationStepId              = string & { readonly __brand: 'InstallationStepId' }

// ── §3.5 Policy Types ────────────────────────────────────────────────────────

export type PackageSourceKind =
  | 'installed'
  | 'local'
  | 'organization'
  | 'marketplace'
  | 'registry'
  | 'direct'

export interface ResolutionPolicySnapshot {
  readonly policyId: string
  readonly policyVersion: string
  readonly minimumDeclaredTrustLevel: TrustLevel
  readonly sourceOrder?: readonly PackageSourceKind[]
  readonly allowList?: readonly PackageId[]
  readonly denyList?: readonly PackageId[]
  readonly optionalRequirementMode: 'ignore' | 'best-effort' | 'require-if-declared'
  readonly maximumGraphNodes: number
  readonly maximumDependencyDepth: number
  readonly maximumBacktrackingSteps: number
  readonly maximumCatalogCandidatesPerRequirement: number
}

// ── §3.1 Graph ───────────────────────────────────────────────────────────────

export interface CatalogSnapshotReference {
  readonly catalogId: CatalogId
  readonly snapshotHash: CatalogSnapshotHash
}

export type ResolutionGraphStatus =
  | 'expanded'
  | 'partial'
  | 'invalid'
  | 'limit-exceeded'

export interface CapabilityResolutionGraph {
  readonly graphId: ResolutionGraphId
  readonly applicationId: ApplicationId
  readonly requirementSetHash: string
  readonly policy: ResolutionPolicySnapshot
  readonly resolverVersion: string
  readonly platformSnapshotHash: PlatformSnapshotHash
  readonly installedStateSnapshotHash: InstalledCapabilitySnapshotHash
  readonly capabilityCatalogSnapshots: readonly CatalogSnapshotReference[]
  readonly languageCatalogSnapshots: readonly CatalogSnapshotReference[]
  readonly modelCatalogSnapshots: readonly CatalogSnapshotReference[]
  readonly nodes: readonly ResolutionNode[]
  readonly edges: readonly ResolutionEdge[]
  readonly roots: readonly ResolutionNodeId[]
  readonly status: ResolutionGraphStatus
  readonly semanticHash: ResolutionGraphSemanticHash
  readonly createdAt: IsoTimestamp
}

// ── §3.4 Supporting types ────────────────────────────────────────────────────

export interface PackageSourceReference {
  readonly kind: PackageSourceKind
  readonly sourceId: string
  readonly artifactId: string
}

export interface CatalogTrustClaim {
  readonly level: TrustLevel
  readonly claimedBy:
    | { readonly kind: 'catalog'; readonly catalogId: CatalogId }
    | { readonly kind: 'package-manifest'; readonly descriptorHash: string }
  readonly verificationStatus: 'unverified'
}

export interface CatalogIntegrityClaim {
  readonly algorithm: string
  readonly value: string
  readonly claimedByCatalogId: CatalogId
  readonly verificationStatus: 'unverified'
}

export type InfrastructureStrategy =
  | 'reuse-existing'
  | 'provision-embedded'
  | 'provision-local-process'
  | 'provision-local-container'
  | 'use-external'

export interface ResolutionPlatformConstraint {
  readonly kind: 'os' | 'arch' | 'min-memory-mb' | 'min-disk-mb' | 'feature'
  readonly value: string
}

// ponytail: JsonValue re-exported from capability-contracts-ir; local alias avoids re-import drift
export type { JsonValue }

// ── §3.2 Node types ──────────────────────────────────────────────────────────

export type ProviderAvailabilityState =
  | 'active-installed'
  | 'inactive-installed'
  | 'available'

export type RequirementPrincipal =
  | { readonly kind: 'application'; readonly applicationId: ApplicationId }
  | { readonly kind: 'package'; readonly packageId: PackageId; readonly version: string }

export interface CapabilityRequirementNode {
  readonly kind: 'capability-requirement'
  readonly nodeId: ResolutionNodeId
  readonly requirementId: CapabilityRequirementId
  readonly capabilityId: CapabilityId
  readonly versionRange: VersionRange
  readonly necessity: 'required' | 'optional'
  readonly origin: RequirementPrincipal
}

export interface CapabilityProviderCandidateNode {
  readonly kind: 'capability-provider-candidate'
  readonly nodeId: ResolutionNodeId
  readonly candidateId: ProviderCandidateId
  readonly providerId: string
  readonly packageId: PackageId
  readonly capabilityId: CapabilityId
  readonly capabilityVersion: string
  readonly providerVersion: string
  readonly source: PackageSourceReference
  readonly trustClaim: CatalogTrustClaim
  readonly installState: ProviderAvailabilityState
}

export interface RohinikPackageNode {
  readonly kind: 'rohinik-package'
  readonly nodeId: ResolutionNodeId
  readonly packageId: PackageId
  readonly versionRange: string
  readonly source: PackageSourceReference
  readonly claimedIntegrity?: CatalogIntegrityClaim
  readonly installState: 'already-installed' | 'to-install'
}

export interface LanguagePackageNode {
  readonly kind: 'language-package'
  readonly nodeId: ResolutionNodeId
  readonly ecosystem: string
  readonly name: string
  readonly versionRange: string
  readonly claimedIntegrity?: CatalogIntegrityClaim
  readonly installState: 'already-installed' | 'to-install'
}

export interface ModelArtifactNode {
  readonly kind: 'model-artifact'
  readonly nodeId: ResolutionNodeId
  readonly modelId: string
  readonly versionRange: string
  readonly registryId: string
  readonly sizeBytes?: number
  readonly claimedIntegrity?: CatalogIntegrityClaim
  readonly installState: 'already-present' | 'to-download'
}

export interface InfrastructureRequirementNode {
  readonly kind: 'infrastructure-requirement'
  readonly nodeId: ResolutionNodeId
  readonly serviceId: string
  readonly serviceType: string
  readonly required: boolean
  readonly allowedStrategies: readonly InfrastructureStrategy[]
  readonly config?: JsonValue
}

export interface ConfigurationNode {
  readonly kind: 'configuration'
  readonly nodeId: ResolutionNodeId
  readonly configurationKey: string
  readonly required: boolean
  readonly defaultValue?: JsonValue
  readonly valueType: 'string' | 'number' | 'boolean' | 'json'
  readonly requiredByPackageIds: readonly PackageId[]
}

export interface SecretRequirementNode {
  readonly kind: 'secret-requirement'
  readonly nodeId: ResolutionNodeId
  readonly secretName: string
  readonly optional: boolean
  readonly purpose: string
  readonly requiredByPackageIds: readonly PackageId[]
}

export interface PermissionNode {
  readonly kind: 'permission'
  readonly nodeId: ResolutionNodeId
  readonly permissionName: string
  readonly required: boolean
  readonly policyAssessment: 'allowed' | 'requires-approval' | 'denied'
}

export interface PlatformRequirementNode {
  readonly kind: 'platform-requirement'
  readonly nodeId: ResolutionNodeId
  readonly requirement: ResolutionPlatformConstraint
  readonly assessment: 'satisfied' | 'unsatisfied' | 'unknown'
}

export type ResolutionNode =
  | CapabilityRequirementNode
  | CapabilityProviderCandidateNode
  | RohinikPackageNode
  | LanguagePackageNode
  | ModelArtifactNode
  | InfrastructureRequirementNode
  | ConfigurationNode
  | SecretRequirementNode
  | PermissionNode
  | PlatformRequirementNode

// ── §3.3 Edge types ──────────────────────────────────────────────────────────

export type ResolutionReasonCode =
  | 'CAPABILITY_VERSION_MISMATCH'
  | 'PACKAGE_DENIED'
  | 'DECLARED_TRUST_BELOW_MINIMUM'
  | 'SOURCE_DISABLED'
  | 'PLATFORM_UNSATISFIED'
  | 'PLATFORM_UNKNOWN'
  | 'PACKAGE_CONFLICT'
  | 'CONSTRAINT_UNSATISFIED'
  | 'DESCRIPTOR_UNAVAILABLE'

export interface ResolutionReason {
  readonly code: ResolutionReasonCode
  readonly message: string
}

export type ResolutionEdge =
  | {
      readonly kind: 'candidate-for'
      readonly from: ResolutionNodeId
      readonly to: ResolutionNodeId
      readonly eligibility: 'eligible' | 'ineligible'
      readonly reasons: readonly ResolutionReason[]
    }
  | {
      readonly kind: 'implemented-by'
      readonly from: ResolutionNodeId
      readonly to: ResolutionNodeId
    }
  | {
      readonly kind: 'depends-on'
      readonly from: ResolutionNodeId
      readonly to: ResolutionNodeId
      readonly versionRange: string
      readonly optional: boolean
    }
  | {
      readonly kind: 'conflicts-with'
      readonly from: ResolutionNodeId
      readonly to: ResolutionNodeId
      readonly reason: string
    }
  | {
      readonly kind: 'replaces'
      readonly from: ResolutionNodeId
      readonly to: ResolutionNodeId
    }
  | {
      readonly kind: 'requires-config'
      readonly from: ResolutionNodeId
      readonly to: ResolutionNodeId
    }
  | {
      readonly kind: 'requires-secret'
      readonly from: ResolutionNodeId
      readonly to: ResolutionNodeId
    }
  | {
      readonly kind: 'requires-perm'
      readonly from: ResolutionNodeId
      readonly to: ResolutionNodeId
    }
  | {
      readonly kind: 'requires-infra'
      readonly from: ResolutionNodeId
      readonly to: ResolutionNodeId
    }
  | {
      readonly kind: 'requires-platform'
      readonly from: ResolutionNodeId
      readonly to: ResolutionNodeId
    }

// ── §3.4 ResolutionWarning ───────────────────────────────────────────────────

export type ResolutionWarningCode =
  | 'DUPLICATE_PROVIDER_CANDIDATE'
  | 'DEPRECATED_PACKAGE'
  | 'LOW_DECLARED_TRUST_CLAIM'
  | 'OPTIONAL_REQUIREMENT_UNRESOLVED'
  | 'PLATFORM_CONSTRAINT_UNCHECKED'
  | 'DESCRIPTOR_HASH_MISMATCH'
  | 'ROOT_NODE_NOT_FOUND'

export interface ResolutionWarning {
  readonly code: ResolutionWarningCode
  readonly message: string
  readonly affectedNodeIds?: readonly ResolutionNodeId[]
}

// ── §4.1 Catalog Snapshot ────────────────────────────────────────────────────

export interface CatalogSnapshot {
  readonly catalogId: CatalogId
  readonly snapshotHash: CatalogSnapshotHash
  readonly capturedAt: IsoTimestamp
}

// ── §4.2 Capability Catalog ──────────────────────────────────────────────────

export interface RohinikPackageSearchRequest {
  readonly packageId: PackageId
  readonly versionRange: string
}

export interface RohinikPackageCandidateRecord {
  readonly packageId: PackageId
  readonly version: string
  readonly source: PackageSourceReference
  readonly claimedIntegrity?: CatalogIntegrityClaim
  readonly descriptorHash?: string
}

// Catalog metadata record — no graph node IDs; candidateId is derived by the resolver
export interface ProviderCandidateRecord {
  readonly providerId: string
  readonly packageId: PackageId
  readonly packageVersion: string
  readonly capabilityId: CapabilityId
  readonly capabilityVersion: string
  readonly source: PackageSourceReference
  readonly descriptorHash: string
  readonly trustClaim: CatalogTrustClaim
}

export interface CapabilityCatalog {
  readonly catalogId: CatalogId
  readonly sourceKind: PackageSourceKind

  getSnapshot(): Promise<CatalogSnapshot>

  findProviders(
    snapshot: CatalogSnapshot,
    capabilityId: CapabilityId,
    versionRange: VersionRange,
  ): Promise<readonly ProviderCandidateRecord[]>

  findPackageVersions(
    snapshot: CatalogSnapshot,
    request: RohinikPackageSearchRequest,
  ): Promise<readonly RohinikPackageCandidateRecord[]>

  getPackageDescriptor(
    snapshot: CatalogSnapshot,
    packageId: PackageId,
    version: string,
  ): Promise<PackageDescriptor | undefined>
}

// ── §4.3 Language Package Catalog ───────────────────────────────────────────

export interface LanguagePackageSearchRequest {
  readonly name: string
  readonly versionRange: string
}

export interface LanguagePackageCandidateRecord {
  readonly name: string
  readonly version: string
  readonly claimedIntegrity?: CatalogIntegrityClaim
  readonly descriptorHash?: string
}

export interface LanguagePackageCatalog {
  readonly catalogId: CatalogId
  readonly ecosystem: string

  getSnapshot(): Promise<CatalogSnapshot>

  findVersions(
    snapshot: CatalogSnapshot,
    request: LanguagePackageSearchRequest,
  ): Promise<readonly LanguagePackageCandidateRecord[]>
}

// ── §4.4 Model Artifact Catalog ──────────────────────────────────────────────

export interface ModelArtifactSearchRequest {
  readonly modelId: string
  readonly versionRange: string
}

export interface ModelArtifactCandidateRecord {
  readonly modelId: string
  readonly version: string
  readonly sizeBytes?: number
  readonly claimedIntegrity?: CatalogIntegrityClaim
}

export interface ModelArtifactCatalog {
  readonly catalogId: CatalogId
  readonly registryId: string

  getSnapshot(): Promise<CatalogSnapshot>

  findVersions(
    snapshot: CatalogSnapshot,
    request: ModelArtifactSearchRequest,
  ): Promise<readonly ModelArtifactCandidateRecord[]>
}

// ── §4.5 Package Descriptor ──────────────────────────────────────────────────

export interface CapabilityDependencyDeclaration {
  readonly capabilityId: CapabilityId
  readonly versionRange: string
  readonly optional: boolean
}

export interface PackageDependencyDeclaration {
  readonly packageId: PackageId
  readonly versionRange: string
  readonly optional: boolean
}

export interface LanguageDependencyDeclaration {
  readonly ecosystem: string
  readonly name: string
  readonly versionRange: string
  readonly optional: boolean
}

export interface ModelDependencyDeclaration {
  readonly modelId: string
  readonly versionRange: string
  readonly registryId: string
  readonly optional: boolean
}

export interface InfrastructureRequirementDeclaration {
  readonly serviceId: string
  readonly serviceType: string
  readonly allowedStrategies: readonly InfrastructureStrategy[]
  readonly required: boolean
}

export interface ConfigurationRequirementDeclaration {
  readonly configurationKey: string
  readonly required: boolean
  readonly defaultValue?: JsonValue
  readonly valueType: 'string' | 'number' | 'boolean' | 'json'
}

export interface SecretRequirementDeclaration {
  readonly secretName: string
  readonly optional: boolean
  readonly purpose: string
}

export interface PermissionRequirementDeclaration {
  readonly permissionName: string
  readonly required: boolean
  readonly justification: string
}

export interface PackageConflictDeclaration {
  readonly conflictingPackageId: PackageId
  readonly reason: string
}

export interface PackageReplacementDeclaration {
  readonly replacedPackageId: PackageId
}

export interface SupportedDependencyCycleDeclaration {
  readonly cycleGroup: string
  readonly activationMode: 'two-phase' | 'lazy'
  readonly members: readonly PackageId[]
}

export interface PackageDescriptor {
  readonly packageId: PackageId
  readonly version: string
  readonly descriptorHash: string
  readonly capabilityDependencies:     readonly CapabilityDependencyDeclaration[]
  readonly packageDependencies:        readonly PackageDependencyDeclaration[]
  readonly languageDependencies:       readonly LanguageDependencyDeclaration[]
  readonly modelDependencies:          readonly ModelDependencyDeclaration[]
  readonly infrastructureRequirements: readonly InfrastructureRequirementDeclaration[]
  readonly configurationRequirements:  readonly ConfigurationRequirementDeclaration[]
  readonly secretRequirements:         readonly SecretRequirementDeclaration[]
  readonly permissionRequirements:     readonly PermissionRequirementDeclaration[]
  readonly platformRequirements:       readonly ResolutionPlatformConstraint[]
  readonly conflicts:                  readonly PackageConflictDeclaration[]
  readonly replacements:               readonly PackageReplacementDeclaration[]
  readonly supportedCycles:            readonly SupportedDependencyCycleDeclaration[]
}

// ── §5 Plan types ────────────────────────────────────────────────────────────

export type ProposedResolutionPlanStatus =
  | 'proposed'
  | 'partial'
  | 'unsatisfiable'
  | 'conflict'
  | 'limit-exceeded'

export interface ProviderSelectionScore {
  readonly installedStateRank: number
  readonly sourcePriorityRank: number
  readonly declaredTrustRank: number
  readonly constraintSatisfactionRank: number
  readonly versionRank: number
  readonly dependencyCostRank: number
  readonly stableTieBreaker: string
}

export interface ProviderResolution {
  readonly requirementId: CapabilityRequirementId
  readonly selectedCandidateId: ProviderCandidateId
  readonly providerId: string
  readonly packageId: PackageId
  readonly capabilityVersion: string
  readonly selectionScore: ProviderSelectionScore
  readonly alternatives: readonly ProviderCandidateId[]
}

export interface PackageResolution {
  readonly packageId: PackageId
  readonly resolvedVersion: string
  readonly source: PackageSourceReference
  readonly claimedIntegrity?: CatalogIntegrityClaim
  readonly introducedBy: readonly ResolutionNodeId[]
}

export interface DependencyResolution {
  readonly ecosystem: string
  readonly name: string
  readonly resolvedVersion: string
  readonly claimedIntegrity?: CatalogIntegrityClaim
  readonly introducedBy: readonly ResolutionNodeId[]
}

export interface ModelResolution {
  readonly modelId: string
  readonly resolvedVersion: string
  readonly registryId: string
  readonly sizeBytes?: number
  readonly claimedIntegrity?: CatalogIntegrityClaim
  readonly introducedBy: readonly ResolutionNodeId[]
}

export interface InfrastructureResolution {
  readonly serviceId: string
  readonly serviceType: string
  readonly proposedAction: InfrastructureStrategy
  readonly requiredBy: readonly ResolutionNodeId[]
}

export interface ConfigurationRequirement {
  readonly configurationKey: string
  readonly required: boolean
  readonly valueType: 'string' | 'number' | 'boolean' | 'json'
  readonly requiredByPackageIds: readonly PackageId[]
  readonly defaultValue?: JsonValue
}

export interface SecretResolution {
  readonly secretName: string
  readonly required: boolean
  readonly purpose: string
  readonly requiredByPackageIds: readonly PackageId[]
}

export interface PermissionRequest {
  readonly permissionName: string
  readonly required: boolean
  readonly requiredByPackageId: PackageId
  readonly justification: string
  readonly policyAssessment: 'allowed' | 'requires-approval' | 'denied'
}

export interface ResolutionFailureEvidence {
  readonly description: string
  readonly nodeIds: readonly ResolutionNodeId[]
}

export interface ResolutionSuggestion {
  readonly description: string
}

export type ResolutionFailureReason =
  | 'no-provider-found'
  | 'version-conflict'
  | 'constraint-conflict'
  | 'source-unavailable'
  | 'platform-incompatible'
  | 'permission-denied'
  | 'circular-dependency'
  | 'graph-limit-exceeded'
  | 'dependency-depth-exceeded'
  | 'solver-limit-exceeded'

export interface UnresolvedRequirement {
  readonly requirementId: CapabilityRequirementId
  readonly capabilityId: CapabilityId
  readonly necessity: 'required' | 'optional'
  readonly reason: ResolutionFailureReason
  readonly summary: string
  readonly conflictingNodes: readonly ResolutionNodeId[]
  readonly evidence: readonly ResolutionFailureEvidence[]
  readonly suggestions: readonly ResolutionSuggestion[]
}

export type ResolutionLimitKind =
  | 'max-graph-nodes'
  | 'max-dependency-depth'
  | 'max-backtracking-steps'
  | 'max-catalog-candidates'

export interface ResolutionLimitFailure {
  readonly kind: ResolutionLimitKind
  readonly bound: number
  readonly reached: number
  readonly summary: string
}

export type ResolutionConflictCode =
  | 'RESOLUTION_VERSION_CONFLICT'
  | 'RESOLUTION_PACKAGE_CONFLICT'
  | 'RESOLUTION_PLATFORM_CONFLICT'
  | 'RESOLUTION_PERMISSION_CONFLICT'
  | 'RESOLUTION_DEPENDENCY_CYCLE'
  | 'RESOLUTION_PROVIDER_AMBIGUITY'
  | 'RESOLUTION_CATALOG_INCONSISTENCY'
  | 'RESOLUTION_CONSTRAINT_CONFLICT'

export interface ConflictVersionRequirement {
  readonly packageId: PackageId
  readonly requiredBy: PackageId
  readonly versionRange: string
}

export interface ResolutionConflict {
  readonly conflictId: ResolutionConflictId
  readonly code: ResolutionConflictCode
  readonly severity: 'error' | 'warning'
  readonly nodeIds: readonly ResolutionNodeId[]
  readonly packageIds: readonly PackageId[]
  readonly capabilityIds: readonly CapabilityId[]
  readonly versionRequirements: readonly ConflictVersionRequirement[]
  readonly summary: string
  readonly evidence: readonly ResolutionFailureEvidence[]
  readonly suggestions: readonly ResolutionSuggestion[]
}

export interface InstallationStep {
  readonly stepId: InstallationStepId
  readonly kind:
    | 'infrastructure'
    | 'language-package'
    | 'model-artifact'
    | 'rohinik-package'
    | 'configuration'
    | 'permission'
    | 'activation'
  readonly targetId: string
  readonly dependsOn: readonly InstallationStepId[]
}

export interface ProposedCapabilityResolutionPlan {
  readonly planId: ResolutionPlanId
  readonly graphId: ResolutionGraphId
  readonly applicationId: ApplicationId
  readonly status: ProposedResolutionPlanStatus
  readonly selectedProviders:          readonly ProviderResolution[]
  readonly packagesToInstall:          readonly PackageResolution[]
  readonly dependenciesToInstall:      readonly DependencyResolution[]
  readonly modelArtifacts:             readonly ModelResolution[]
  readonly infrastructureActions:      readonly InfrastructureResolution[]
  readonly configurationRequirements:  readonly ConfigurationRequirement[]
  readonly secretRequirements:         readonly SecretResolution[]
  readonly permissionsToRequest:       readonly PermissionRequest[]
  readonly unresolvedRequirements:     readonly UnresolvedRequirement[]
  readonly limitFailures:              readonly ResolutionLimitFailure[]
  readonly conflicts:                  readonly ResolutionConflict[]
  readonly warnings:                   readonly ResolutionWarning[]
  readonly installationOrder:          readonly InstallationStep[]
  readonly semanticHash: ResolutionPlanSemanticHash
  readonly createdAt: IsoTimestamp
}

// ── §10.1–10.3 Service types ─────────────────────────────────────────────────

export interface PlatformSnapshot {
  readonly snapshotHash: PlatformSnapshotHash
  readonly os: string
  readonly arch: string
  readonly memoryMb: number
  readonly diskMb: number
  readonly features: readonly string[]
}

export interface InstalledProviderRecord {
  readonly providerId: string
  readonly packageId: PackageId
  readonly packageVersion: string
  readonly capabilityId: CapabilityId
  readonly capabilityVersion: string
  readonly state: 'active' | 'inactive'
}

export interface InstalledPackageRecord {
  readonly packageId: PackageId
  readonly version: string
  readonly source: PackageSourceReference
  readonly verifiedIntegrity?: string
}

export interface InstalledLanguagePackageRecord {
  readonly ecosystem: string
  readonly name: string
  readonly version: string
}

export interface InstalledModelRecord {
  readonly modelId: string
  readonly version: string
  readonly registryId: string
}

export interface InstalledInfrastructureRecord {
  readonly serviceId: string
  readonly serviceType: string
  readonly reusable: boolean
}

export interface InstalledCapabilitySnapshot {
  readonly snapshotHash: InstalledCapabilitySnapshotHash
  readonly providers: readonly InstalledProviderRecord[]
  readonly packages: readonly InstalledPackageRecord[]
  readonly languagePackages: readonly InstalledLanguagePackageRecord[]
  readonly models: readonly InstalledModelRecord[]
  readonly infrastructure: readonly InstalledInfrastructureRecord[]
}

export interface CapabilityResolutionInput {
  readonly requirementSet: CapabilityRequirementSet
  readonly resolutionConfig: ResolutionConfig
  readonly policy: ResolutionPolicySnapshot
  readonly platform: PlatformSnapshot
  readonly installedState: InstalledCapabilitySnapshot
  readonly capabilityCatalogs: readonly CapabilityCatalog[]
  readonly languagePackageCatalogs: readonly LanguagePackageCatalog[]
  readonly modelArtifactCatalogs: readonly ModelArtifactCatalog[]
}

export interface ResolutionDiagnostic {
  readonly code: string
  readonly severity: 'error' | 'warning' | 'info'
  readonly message: string
}

export type ResolutionGraphBuildResult =
  | { readonly status: 'built'; readonly graph: CapabilityResolutionGraph; readonly diagnostics: readonly ResolutionDiagnostic[] }
  | { readonly status: 'invalid-input'; readonly diagnostics: readonly ResolutionDiagnostic[] }
  | { readonly status: 'failed'; readonly diagnostics: readonly ResolutionDiagnostic[] }

export interface CapabilityResolutionService {
  buildGraph(input: CapabilityResolutionInput): Promise<ResolutionGraphBuildResult>
  solve(graph: CapabilityResolutionGraph): Promise<ProposedCapabilityResolutionPlan>
  serialize(plan: ProposedCapabilityResolutionPlan): string
}
