// ─── Branded IDs ─────────────────────────────────────────────────────────────
export type PackageTrustSubjectId      = string & { readonly __brand: 'PackageTrustSubjectId' }
export type StagingId                  = string & { readonly __brand: 'StagingId' }
export type TrustDecisionId            = string & { readonly __brand: 'TrustDecisionId' }
export type AcquisitionAuthorizationId = string & { readonly __brand: 'AcquisitionAuthorizationId' }
export type QuarantineId               = string & { readonly __brand: 'QuarantineId' }
export type TrustPolicyExceptionId     = string & { readonly __brand: 'TrustPolicyExceptionId' }
export type TrustEvidenceSemanticHash  = string & { readonly __brand: 'TrustEvidenceSemanticHash' }
export type TrustDecisionSemanticHash  = string & { readonly __brand: 'TrustDecisionSemanticHash' }

// ─── Integrity digest ─────────────────────────────────────────────────────────
export interface IntegrityDigest {
  readonly algorithm: 'sha256' | 'sha512'
  readonly encoding: 'hex' | 'sri-base64'
  readonly value: string
}

// ─── External source identity ─────────────────────────────────────────────────
export type ExternalSourceKind =
  | 'workspace'
  | 'organization-registry'
  | 'rohinik-marketplace'
  | 'npm-registry'
  | 'pypi-registry'
  | 'model-registry'
  | 'oci-registry'
  | 'git-repository'
  | 'direct-artifact'

export type ExternalSourceIdentity =
  | {
      readonly sourceKind: 'workspace'
      readonly workspaceId: string
      readonly artifactId: string
    }
  | {
      readonly sourceKind:
        | 'organization-registry'
        | 'rohinik-marketplace'
        | 'npm-registry'
        | 'pypi-registry'
        | 'model-registry'
        | 'oci-registry'
      readonly registryId: string
      readonly artifactLocator: string
    }
  | {
      readonly sourceKind: 'git-repository'
      readonly repositoryIdentity: string
      readonly commitSha: string
      readonly subdirectory?: string
    }
  | {
      readonly sourceKind: 'direct-artifact'
      readonly authorizedSourceId: string
      readonly artifactLocator: string
    }

// ─── Package trust subject ────────────────────────────────────────────────────
export interface PublisherIdentityReference {
  readonly publisherKind: string
  readonly publisherId: string
}

export interface PackageTrustSubject {
  readonly subjectKind:
    | 'rohinik-package'
    | 'language-dependency'
    | 'model-artifact'
    | 'infrastructure-artifact'
    | 'provider-artifact'
  readonly packageId: string
  readonly version: string
  readonly sourceIdentity: ExternalSourceIdentity
  readonly expectedIntegrity: IntegrityDigest
  readonly publisherIdentity?: PublisherIdentityReference
  readonly manifestSemanticHash?: string
  readonly permissionManifestSemanticHash?: string
}

// ─── Acquisition authorization ────────────────────────────────────────────────
export interface AcquisitionAuthorization {
  readonly acquisitionAuthorizationId: AcquisitionAuthorizationId
  readonly subject: PackageTrustSubject
  readonly issuedAt: string
  readonly expiresAt: string
}

// ─── Expected integrity evidence ─────────────────────────────────────────────
export interface ExpectedIntegrityEvidence {
  readonly subject: PackageTrustSubject
  readonly expectedIntegrity: IntegrityDigest
  readonly authority:
    | {
        readonly authorityKind: 'signed-catalog'
        readonly catalogId: string
        readonly snapshotSemanticHash: string
        readonly signingKeyId: string
      }
    | {
        readonly authorityKind: 'registry-metadata'
        readonly registryId: string
        readonly metadataSemanticHash: string
      }
    | {
        readonly authorityKind: 'content-addressed-reference'
        readonly storeId: string
      }
    | {
        readonly authorityKind: 'authorized-local-declaration'
        readonly declarationId: string
        readonly authorizedBy: string
      }
  readonly authorizationId: string
}

// ─── Inert artifact handle ────────────────────────────────────────────────────
export interface InertArtifactHandle {
  readonly stagingId: StagingId
  readonly subject: PackageTrustSubject
  readonly relativeArtifactPath: string
  readonly sizeBytes: number
  readonly acquiredFrom: ExternalSourceIdentity
}

// ─── Artifact byte reader port ────────────────────────────────────────────────
export interface ArtifactByteReader {
  streamArtifact(handle: InertArtifactHandle): AsyncIterable<Uint8Array>
  dispose(handle: InertArtifactHandle): Promise<void>
}

// ─── Policy contracts ─────────────────────────────────────────────────────────
export interface SourceTrustRule {
  readonly order: number
  readonly sourceKind: ExternalSourceKind
  readonly registryPattern?: string
  readonly effect: 'allow' | 'deny'
}

export interface PublisherTrustRule {
  readonly order: number
  readonly publisherPattern: string
  readonly namespacePattern?: string
  readonly effect: 'allow' | 'deny' | 'manual-review'
}

export interface SignaturePolicyRule {
  readonly order: number
  readonly required: boolean
  readonly subjectKind?: PackageTrustSubject['subjectKind']
  readonly sourceKind?: ExternalSourceKind
}

export interface ProvenancePolicyRule {
  readonly order: number
  readonly required: boolean
  readonly acceptedBuilderIdentities: readonly string[]
}

export interface PermissionPolicyRule {
  readonly order: number
  readonly domain: string
  readonly resourcePattern?: string
  readonly effect: 'allow' | 'deny' | 'conditional'
  readonly conditionId?: string
  readonly allowWildcards?: boolean
}

export interface VulnerabilityPolicyRule {
  readonly order: number
  readonly severity: 'unknown' | 'low' | 'medium' | 'high' | 'critical'
  readonly effect: 'allow' | 'deny' | 'manual-review'
}

export interface PackageTrustPolicySnapshot {
  readonly policyId: string
  readonly policyVersion: string
  readonly semanticHash: string
  readonly sourceRules: readonly SourceTrustRule[]
  readonly publisherRules: readonly PublisherTrustRule[]
  readonly signatureRules: readonly SignaturePolicyRule[]
  readonly provenanceRules: readonly ProvenancePolicyRule[]
  readonly permissionRules: readonly PermissionPolicyRule[]
  readonly vulnerabilityRules: readonly VulnerabilityPolicyRule[]
  readonly unknownSourceDecision: 'deny'
  readonly unknownPublisherDecision: 'deny' | 'manual-review'
  readonly missingRevocationDataDecision: 'deny' | 'manual-review'
}

// ─── Trust root contracts ─────────────────────────────────────────────────────
export interface TrustedIssuer {
  readonly issuerId: string
  readonly keyId: string
  readonly algorithm: 'ed25519'
  readonly publicKeyReference: string
  readonly status: 'active' | 'revoked'
}

export interface PublisherNamespaceBinding {
  readonly issuerId: string
  readonly namespacePattern: string
}

export interface TrustRootSnapshot {
  readonly snapshotId: string
  readonly semanticHash: string
  readonly createdAt: string
  readonly issuers: readonly TrustedIssuer[]
  readonly namespaceBindings: readonly PublisherNamespaceBinding[]
}

// ─── Revocation contracts ─────────────────────────────────────────────────────
export type RevocationTargetKind =
  | 'issuer'
  | 'key'
  | 'artifact-digest'
  | 'package'
  | 'package-version'

export interface RevocationEntry {
  readonly targetKind: RevocationTargetKind
  readonly targetId: string
  readonly reason: string
  readonly revokedAt: string
}

export interface RevocationSnapshot {
  readonly snapshotId: string
  readonly semanticHash: string
  readonly issuedAt: string
  readonly entries: readonly RevocationEntry[]
}

// ─── Enforcement profile ──────────────────────────────────────────────────────
export interface PermissionEnforcementCapability {
  readonly domain: string
  readonly enforced: boolean
}

export interface EnforcementProfileSnapshot {
  readonly profileId: string
  readonly semanticHash: string
  readonly capabilities: readonly PermissionEnforcementCapability[]
}

// ─── Vulnerability policy snapshot ───────────────────────────────────────────
export interface VulnerabilityPolicySnapshot {
  readonly snapshotId: string
  readonly semanticHash: string
  readonly issuedAt: string
}

// ─── Trust evaluation context ─────────────────────────────────────────────────
export interface TrustEvaluationContext {
  readonly policySnapshot: PackageTrustPolicySnapshot
  readonly trustRootSnapshot: TrustRootSnapshot
  readonly revocationSnapshot?: RevocationSnapshot
  readonly enforcementProfile: EnforcementProfileSnapshot
  readonly vulnerabilityPolicySnapshot?: VulnerabilityPolicySnapshot
}

// ─── Signature contracts ──────────────────────────────────────────────────────
export interface SignedStatement {
  readonly subjectSemanticHash: string
  readonly artifactIntegrity: IntegrityDigest
  readonly manifestSemanticHash?: string
  readonly permissionManifestSemanticHash?: string
}

export interface PackageSignatureEnvelope {
  readonly signatureVersion: string
  readonly algorithm: 'ed25519'
  readonly issuerId: string
  readonly keyId: string
  readonly signedAt: string
  readonly signedStatement: SignedStatement
  readonly signature: string
}

export interface SignedPackageEnvelopePayload {
  readonly signatureVersion: string
  readonly algorithm: 'ed25519'
  readonly issuerId: string
  readonly keyId: string
  readonly signedAt: string
  readonly signedStatement: SignedStatement
}

// ─── Provenance contract ──────────────────────────────────────────────────────
export interface BuildProvenanceEnvelope {
  readonly provenanceVersion: string
  readonly issuerId: string
  readonly buildId: string
  readonly outputIntegrity: IntegrityDigest
  readonly builderIdentity: string
  readonly builtAt: string
  readonly signature: string
}

// ─── Permission contracts ─────────────────────────────────────────────────────
export interface CanonicalPermission {
  readonly domain: string
  readonly value: string
  readonly resourceConstraint?: string
}

export interface PackagePermissionManifest {
  readonly manifestVersion: string
  readonly requestedPermissions: readonly CanonicalPermission[]
  readonly semanticHash: string
}

export interface AuthorizedPermission {
  readonly permission: CanonicalPermission
  readonly conditionId?: string
}

export interface DeniedPermission {
  readonly permission: CanonicalPermission
  readonly reason: string
}

export interface PermissionEnforcementAssessment {
  readonly enforceable: boolean
  readonly capabilities: readonly PermissionEnforcementCapability[]
  readonly unenforceablePermissions: readonly string[]
}

export interface PermissionAssessment {
  readonly manifestSemanticHash: string
  readonly declaredPermissions: readonly CanonicalPermission[]
  readonly grantedPermissions: readonly AuthorizedPermission[]
  readonly deniedPermissions: readonly DeniedPermission[]
  readonly enforcementAssessment: PermissionEnforcementAssessment
  readonly decision: 'granted' | 'conditionally-granted' | 'denied'
}

// ─── Assessment contracts ─────────────────────────────────────────────────────
export interface SourceAssessment {
  readonly passed: boolean
  readonly sourceKind: ExternalSourceKind
  readonly reason?: string
}

export interface IntegrityAssessment {
  readonly passed: boolean
  readonly expectedIntegrity: IntegrityDigest
  readonly observedIntegrity?: IntegrityDigest
  readonly reason?:
    | 'subject-mismatch'
    | 'source-mismatch'
    | 'digest-format-invalid'
    | 'artifact-read-failed'
    | 'integrity-mismatch'
}

export interface SignatureAssessment {
  readonly passed: boolean
  readonly issuerId?: string
  readonly keyId?: string
  readonly reason?: string
}

export interface PublisherAssessment {
  readonly decision: 'accepted' | 'manual-review-required' | 'rejected'
  readonly reason?: string
}

export interface RevocationAssessment {
  readonly decision: 'passed' | 'manual-review-required' | 'failed'
  readonly checkedSnapshotSemanticHash?: string
  readonly reason?: string
}

export interface ProvenanceAssessment {
  readonly passed: boolean
  readonly builderIdentity?: string
  readonly reason?: string
}

export interface VulnerabilityFinding {
  readonly advisoryId: string
  readonly severity: 'unknown' | 'low' | 'medium' | 'high' | 'critical'
  readonly description?: string
}

export interface VulnerabilityAssessment {
  readonly findings: readonly VulnerabilityFinding[]
  readonly scannerSemanticHash: string
}

// ─── Trust decision ───────────────────────────────────────────────────────────
export type PackageTrustDecision =
  | 'trusted'
  | 'conditionally-trusted'
  | 'quarantined'
  | 'manual-review-required'
  | 'denied'

// ─── Evaluation request ───────────────────────────────────────────────────────
export interface PackageTrustEvaluationRequest {
  readonly subject: PackageTrustSubject
  readonly acquisitionAuthorization: AcquisitionAuthorization
  readonly handle: InertArtifactHandle
  readonly expectedIntegrityEvidence: ExpectedIntegrityEvidence
  readonly signatureEnvelope?: PackageSignatureEnvelope
  readonly provenanceEnvelope?: BuildProvenanceEnvelope
  readonly permissionManifest?: PackagePermissionManifest
  readonly context: TrustEvaluationContext
  readonly evaluatedAt: string
}

// ─── Decision record ──────────────────────────────────────────────────────────
export interface PackageTrustDecisionRecord {
  readonly decisionId: TrustDecisionId
  readonly subject: PackageTrustSubject
  readonly subjectHash: string
  readonly decision: PackageTrustDecision
  readonly reasonCodes: readonly string[]
  readonly sourceAssessment?: SourceAssessment
  readonly integrityAssessment?: IntegrityAssessment
  readonly signatureAssessment?: SignatureAssessment
  readonly publisherAssessment?: PublisherAssessment
  readonly revocationAssessment?: RevocationAssessment
  readonly provenanceAssessment?: ProvenanceAssessment
  readonly permissionAssessment?: PermissionAssessment
  readonly vulnerabilityAssessment?: VulnerabilityAssessment
  readonly policySemanticHash: string
  readonly trustRootSnapshotSemanticHash: string
  readonly revocationSnapshotSemanticHash?: string
  readonly enforcementProfileSemanticHash: string
  readonly evaluatedAt: string
  readonly decisionSemanticHash: TrustDecisionSemanticHash
  readonly reevaluationOf?: TrustDecisionId
}

// ─── Evidence bundle ─────────────────────────────────────────────────────────
export interface ArtifactTrustEvidenceBundle {
  readonly bundleVersion: 1
  readonly subject: PackageTrustSubject
  readonly observedIntegrity?: IntegrityDigest
  readonly sourceAssessment?: SourceAssessment
  readonly integrityAssessment?: IntegrityAssessment
  readonly signatureAssessment?: SignatureAssessment
  readonly publisherAssessment?: PublisherAssessment
  readonly revocationAssessment?: RevocationAssessment
  readonly provenanceAssessment?: ProvenanceAssessment
  readonly permissionAssessment?: PermissionAssessment
  readonly vulnerabilityAssessment?: VulnerabilityAssessment
  readonly trustDecisionId: TrustDecisionId
  readonly semanticHash: TrustEvidenceSemanticHash
}

// ─── Runtime permission grant ─────────────────────────────────────────────────
export interface ConditionalPermission {
  readonly permission: CanonicalPermission
  readonly conditionId: string
}

export interface RuntimePermissionGrant {
  readonly grantId: string
  readonly decisionId: TrustDecisionId
  readonly subject: PackageTrustSubject
  readonly grantedPermissions: readonly CanonicalPermission[]
  readonly conditionalPermissions: readonly ConditionalPermission[]
  readonly grantedAt: string
  readonly grantSemanticHash: string
}

// ─── Evaluation result ────────────────────────────────────────────────────────
export interface PackageTrustEvaluationResult {
  readonly decision: PackageTrustDecisionRecord
  readonly evidence: ArtifactTrustEvidenceBundle
  readonly permissionGrant?: RuntimePermissionGrant
}

// ─── Evaluator port ───────────────────────────────────────────────────────────
export interface PackageTrustEvaluator {
  evaluate(request: PackageTrustEvaluationRequest): Promise<PackageTrustEvaluationResult>
}

// ─── Quarantine contracts ─────────────────────────────────────────────────────
export type QuarantineReasonCode =
  | 'source-denied'
  | 'source-identity-invalid'
  | 'expected-integrity-unavailable'
  | 'integrity-mismatch'
  | 'signature-required'
  | 'signature-invalid'
  | 'issuer-untrusted'
  | 'publisher-namespace-unauthorized'
  | 'signing-key-revoked'
  | 'publisher-revoked'
  | 'artifact-revoked'
  | 'provenance-required'
  | 'provenance-invalid'
  | 'permission-denied'
  | 'permission-unenforceable'
  | 'critical-vulnerability'
  | 'policy-violation'
  | 'archive-safety-violation'

export type QuarantineStatus =
  | 'active'
  | 'released-for-reevaluation'
  | 'destroyed'
  | 'superseded'

export interface QuarantineRecord {
  readonly quarantineId: QuarantineId
  readonly subject: PackageTrustSubject
  readonly artifactIntegrity?: IntegrityDigest
  readonly reasonCodes: readonly QuarantineReasonCode[]
  readonly trustDecisionId?: TrustDecisionId
  readonly placedAt: string
  readonly evidenceSemanticHash: string
  readonly status: QuarantineStatus
}

export interface QuarantinePlacement {
  readonly subject: PackageTrustSubject
  readonly reasonCodes: readonly QuarantineReasonCode[]
  readonly trustDecisionId?: TrustDecisionId
  readonly artifactIntegrity?: IntegrityDigest
  readonly evidenceSemanticHash: string
}

export interface QuarantineFilter {
  readonly status?: QuarantineStatus
  readonly packageId?: string
}

export interface QuarantineReevaluationRequest {
  readonly quarantineId: QuarantineId
  readonly requestedBy: string
}

export interface QuarantineDestroyRequest {
  readonly quarantineId: QuarantineId
  readonly requestedBy: string
  readonly reason: string
}

export interface QuarantineArtifactReference {
  readonly stagingId: StagingId
  readonly relativeArtifactPath: string
}

export interface QuarantineReleaseResult {
  readonly record: QuarantineRecord
  readonly artifactReference?: QuarantineArtifactReference
  readonly requiresReacquisition: boolean
}

export interface QuarantineStore {
  place(input: QuarantinePlacement): Promise<QuarantineRecord>
  get(quarantineId: QuarantineId): Promise<QuarantineRecord | undefined>
  list(filter?: QuarantineFilter): Promise<readonly QuarantineRecord[]>
  releaseForReevaluation(request: QuarantineReevaluationRequest): Promise<QuarantineReleaseResult>
  destroy(request: QuarantineDestroyRequest): Promise<void>
}

// ─── Repository contracts ─────────────────────────────────────────────────────
export interface PackageTrustRepositoryRecord {
  readonly sequence: number
  readonly previousRecordHash?: string
  readonly decision: PackageTrustDecisionRecord
  readonly evidenceSemanticHash: string
  readonly recordHash: string
}

export interface PackageTrustRepository {
  appendDecision(record: PackageTrustRepositoryRecord): Promise<void>
  appendAuthorization(record: {
    readonly authorizationId: string
    readonly subjectDecisionIds: readonly TrustDecisionId[]
    readonly authorizedPlanSemanticHash: string
    readonly policySemanticHash: string
  }): Promise<void>
  appendPolicySnapshot(snapshot: PackageTrustPolicySnapshot): Promise<void>
  appendTrustRootSnapshot(snapshot: TrustRootSnapshot): Promise<void>
  appendRevocationSnapshot(snapshot: RevocationSnapshot): Promise<void>
  findLatestDecision(subjectHash: string): Promise<PackageTrustRepositoryRecord | undefined>
  findByDecisionId(decisionId: TrustDecisionId): Promise<PackageTrustRepositoryRecord | undefined>
  listDecisions(subjectHash?: string): Promise<readonly PackageTrustRepositoryRecord[]>
  verifyChainIntegrity(): Promise<{ readonly valid: boolean; readonly brokenAtSequence?: number }>
}

// ─── Reevaluation contracts ───────────────────────────────────────────────────
export interface EvidenceReevaluationRequest {
  readonly subject: PackageTrustSubject
  readonly previousObservedIntegrity: IntegrityDigest
  readonly signatureEnvelope?: PackageSignatureEnvelope
  readonly provenanceEnvelope?: BuildProvenanceEnvelope
  readonly permissionManifest?: PackagePermissionManifest
  readonly context: TrustEvaluationContext
  readonly evaluatedAt: string
}

export interface TrustReevaluationService {
  reevaluateEvidence(
    previousRecord: PackageTrustDecisionRecord,
    request: EvidenceReevaluationRequest,
  ): Promise<PackageTrustEvaluationResult>
  reevaluateArtifact(
    request: PackageTrustEvaluationRequest,
    reevaluationOf?: TrustDecisionId,
  ): Promise<PackageTrustEvaluationResult>
}

// ─── Containment contracts ────────────────────────────────────────────────────
export interface TrustContainmentResult {
  readonly success: boolean
  readonly status: 'contained' | 'partially-contained' | 'unsupported' | 'failed'
  readonly completedActions: readonly string[]
  readonly failedActions: readonly string[]
  readonly reason?: string
}

export interface TrustContainmentPort {
  contain(request: {
    readonly subject: PackageTrustSubject
    readonly action:
      | 'revoke-grants'
      | 'mark-unavailable'
      | 'quarantine-inactive'
      | 'require-restart'
  }): Promise<TrustContainmentResult>
}

// ─── Supporting ports ─────────────────────────────────────────────────────────
export interface TrustPublicKeyProvider {
  resolvePublicKey(
    issuerId: string,
    keyId: string,
    trustRootSnapshotId: string,
  ): Promise<{
    readonly issuerId: string
    readonly keyId: string
    readonly algorithm: 'ed25519'
    readonly publicKeyDer: Uint8Array
    readonly publicKeyFormat: 'spki-der'
  }>
}

export interface VulnerabilityScanner {
  scan(request: {
    readonly subject: PackageTrustSubject
    readonly observedArtifactIntegrity: IntegrityDigest
  }): Promise<VulnerabilityAssessment>
}

// ─── Provisioning authorization (context + result only — authorizer defined in impl task) ──
export interface ProvisioningAuthorizationContext {
  readonly policySemanticHash: string
  readonly authorizedBy: string
  readonly evaluatedAt: string
}

export type ProvisioningAuthorizationDecision =
  | 'authorized'
  | 'denied'
  | 'manual-review-required'

export interface ProvisioningAuthorizationResult {
  readonly decision: ProvisioningAuthorizationDecision
  readonly reasonCodes: readonly string[]
  readonly authorizedPlanSemanticHash?: string
}

// ─── Typed errors ─────────────────────────────────────────────────────────────
export class PackageSourceDeniedError extends Error {
  override readonly name = 'PackageSourceDeniedError'
  constructor(
    public readonly reasonCodes: readonly QuarantineReasonCode[],
    public readonly subject: PackageTrustSubject,
  ) {
    super(`Package source denied for ${subject.packageId}@${subject.version}: ${reasonCodes.join(', ')}`)
  }
}

export class PackageIntegrityMismatchError extends Error {
  override readonly name = 'PackageIntegrityMismatchError'
  constructor(
    public readonly subject: PackageTrustSubject,
    public readonly expectedDigest: string,
    public readonly observedDigest: string,
  ) {
    super(`Integrity mismatch for ${subject.packageId}@${subject.version}`)
  }
}

export class PackageSignatureInvalidError extends Error {
  override readonly name = 'PackageSignatureInvalidError'
  constructor(
    public readonly subject: PackageTrustSubject,
    public readonly reason: string,
  ) {
    super(`Signature invalid for ${subject.packageId}@${subject.version}: ${reason}`)
  }
}

export class PackageAuthorizationError extends Error {
  override readonly name = 'PackageAuthorizationError'
  constructor(
    public readonly reason: string,
    public readonly subject?: PackageTrustSubject,
  ) {
    super(`Authorization error: ${reason}`)
  }
}

export class PackageQuarantinedError extends Error {
  override readonly name = 'PackageQuarantinedError'
  constructor(
    public readonly quarantineId: QuarantineId,
    public readonly subject: PackageTrustSubject,
    public readonly reasonCodes: readonly QuarantineReasonCode[],
  ) {
    super(`Package quarantined: ${subject.packageId}@${subject.version} (${quarantineId})`)
  }
}
