import type {
  PackageTrustSubject,
  IntegrityAssessment,
  SignatureAssessment,
  PublisherAssessment,
  RevocationAssessment,
  ProvenanceAssessment,
  PermissionAssessment,
  VulnerabilityAssessment,
  TrustEvaluationContext,
} from '@rohinik-org/package-trust-ir'
import type {
  PackageTrustDecisionRequest,
  PackageTrustPolicy,
} from '@rohinik-org/package-trust-decision'
import type {
  RecordTrustDecisionCommand,
  ArtifactIdentity,
  PolicyReference,
  OperationId,
  RepositoryRecordId,
} from '@rohinik-org/package-trust-repository'
import type {
  PackageQuarantineRequest,
  PackageQuarantinePolicy,
  QuarantineArtifactRef,
  PackageQuarantineContext,
} from '@rohinik-org/package-quarantine'
import type {
  PackageProvisioningAuthorizationRequest,
  PackageProvisioningAuthorizationPolicy,
  PackageProvisioningTrustSnapshot,
} from '@rohinik-org/package-provisioning-authorization'

// ─── Canonical artifact identity ─────────────────────────────────────────────

export const ARTIFACT_DIGEST = 'sha256:abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'
export const ALT_ARTIFACT_DIGEST = 'sha256:deadbeef1234567890abcdef1234567890abcdef1234567890abcdef12345678'
export const PACKAGE_ID = 'com.example.test-package'
export const PACKAGE_VERSION = '1.2.3'
export const TENANT_ID = 'tenant-001'
export const ALT_TENANT_ID = 'tenant-002'
export const ENVIRONMENT_ID = 'env-prod'
export const ALT_ENVIRONMENT_ID = 'env-staging'
export const POLICY_ID = 'policy-9j-integration'
export const POLICY_VERSION = '1.0'
export const OPERATION_ID_1 = 'op-t15-001' as OperationId
export const OPERATION_ID_2 = 'op-t15-002' as OperationId
export const RECORD_ID_1 = 'rec-t15-001' as RepositoryRecordId
export const RECORD_ID_2 = 'rec-t15-002' as RepositoryRecordId
export const ISSUED_AT = '2026-07-30T10:00:00.000Z'
export const EVALUATED_AT = '2026-07-30T10:00:00.000Z'

export const CANONICAL_SUBJECT: PackageTrustSubject = {
  subjectKind: 'language-dependency',
  packageId: PACKAGE_ID,
  version: PACKAGE_VERSION,
  sourceIdentity: {
    sourceKind: 'npm-registry',
    registryId: 'registry.npmjs.org',
    artifactLocator: `${PACKAGE_ID}@${PACKAGE_VERSION}`,
  },
  expectedIntegrity: {
    algorithm: 'sha256',
    encoding: 'hex',
    value: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
  },
  publisherIdentity: { publisherKind: 'npm', publisherId: 'example-org' },
}

export const ALT_SUBJECT: PackageTrustSubject = {
  ...CANONICAL_SUBJECT,
  expectedIntegrity: {
    algorithm: 'sha256',
    encoding: 'hex',
    value: 'deadbeef1234567890abcdef1234567890abcdef1234567890abcdef12345678',
  },
}

export const ARTIFACT_IDENTITY: ArtifactIdentity = {
  packageId: PACKAGE_ID,
  version: PACKAGE_VERSION,
  artifactDigest: ARTIFACT_DIGEST,
}

export const POLICY_REF: PolicyReference = {
  policyId: POLICY_ID,
  policyVersion: POLICY_VERSION,
  semanticHash: 'hash-policy-001',
}

// ─── Assessments ─────────────────────────────────────────────────────────────

export const PASSING_INTEGRITY: IntegrityAssessment = { passed: true, expectedIntegrity: { algorithm: 'sha256', encoding: 'hex', value: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890' } }
export const FAILING_INTEGRITY: IntegrityAssessment = { passed: false, expectedIntegrity: { algorithm: 'sha256', encoding: 'hex', value: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890' }, reason: 'integrity-mismatch' }
export const PASSING_SIGNATURE: SignatureAssessment = { passed: true, issuerId: 'issuer-001', keyId: 'key-001' }
export const FAILING_SIGNATURE: SignatureAssessment = { passed: false, reason: 'invalid-signature' }
export const TRUSTED_PUBLISHER: PublisherAssessment = { decision: 'accepted' }
export const MANUAL_REVIEW_PUBLISHER: PublisherAssessment = { decision: 'manual-review-required' }
export const REJECTED_PUBLISHER: PublisherAssessment = { decision: 'rejected' }
export const PASSING_REVOCATION: RevocationAssessment = { decision: 'passed' }
export const FAILING_REVOCATION: RevocationAssessment = { decision: 'failed', reason: 'artifact-revoked' }
export const PASSING_PROVENANCE: ProvenanceAssessment = { passed: true, builderIdentity: 'builder-001' }
export const PASSING_PERMISSIONS: PermissionAssessment = {
  manifestSemanticHash: 'hash-perm-001',
  declaredPermissions: [],
  grantedPermissions: [],
  deniedPermissions: [],
  enforcementAssessment: {
    enforceable: true,
    capabilities: [],
    unenforceablePermissions: [],
  },
  decision: 'granted',
}
export const CLEAN_VULNS: VulnerabilityAssessment = { findings: [], scannerSemanticHash: 'hash-scanner-001' }
export const CRITICAL_VULN: VulnerabilityAssessment = {
  findings: [{ advisoryId: 'CVE-2026-9999', severity: 'critical', description: 'Critical vulnerability' }],
  scannerSemanticHash: 'hash-scanner-001',
}

// ─── Evaluation context ───────────────────────────────────────────────────────

export const EVALUATION_CONTEXT: TrustEvaluationContext = {
  policySnapshot: {
    policyId: POLICY_ID,
    policyVersion: POLICY_VERSION,
    semanticHash: 'hash-policy-001',
    sourceRules: [],
    publisherRules: [],
    signatureRules: [],
    provenanceRules: [],
    permissionRules: [],
    vulnerabilityRules: [],
    unknownSourceDecision: 'deny',
    unknownPublisherDecision: 'deny',
    missingRevocationDataDecision: 'deny',
  },
  trustRootSnapshot: {
    snapshotId: 'trust-root-001',
    semanticHash: 'hash-trust-root-001',
    createdAt: ISSUED_AT,
    issuers: [],
    namespaceBindings: [],
  },
  enforcementProfile: {
    profileId: 'profile-001',
    semanticHash: 'hash-enforce-001',
    capabilities: [],
  },
}

// ─── Trust policy ─────────────────────────────────────────────────────────────

export const TRUST_POLICY: PackageTrustPolicy = {
  policyId: POLICY_ID,
  policyVersion: POLICY_VERSION,
  snapshot: EVALUATION_CONTEXT.policySnapshot,
  requiredAssessments: ['integrity', 'signature', 'publisher', 'revocation', 'provenance', 'permission', 'vulnerability'],
  allowDegradedTrust: true,
  hardRejectRules: [],
  manualReviewRules: [],
  degradedRules: [],
  advisoryRules: [],
}

// ─── Canonical trust decision request ────────────────────────────────────────

export function makeTrustedDecisionRequest(overrides: Partial<PackageTrustDecisionRequest> = {}): PackageTrustDecisionRequest {
  return {
    subject: CANONICAL_SUBJECT,
    integrityAssessment: PASSING_INTEGRITY,
    signatureAssessment: PASSING_SIGNATURE,
    publisherAssessment: TRUSTED_PUBLISHER,
    revocationAssessment: PASSING_REVOCATION,
    provenanceAssessment: PASSING_PROVENANCE,
    permissionAssessment: PASSING_PERMISSIONS,
    vulnerabilityAssessment: CLEAN_VULNS,
    policy: TRUST_POLICY,
    context: EVALUATION_CONTEXT,
    evaluatedAt: EVALUATED_AT,
    ...overrides,
  }
}

// ─── Repository commands ──────────────────────────────────────────────────────

export function makeRecordTrustDecisionCommand(decision: import('@rohinik-org/package-trust-ir').PackageTrustDecision = 'trusted', overrides: Partial<RecordTrustDecisionCommand> = {}): RecordTrustDecisionCommand {
  return {
    operationId: OPERATION_ID_1,
    recordId: RECORD_ID_1,
    subject: CANONICAL_SUBJECT,
    artifactIdentity: ARTIFACT_IDENTITY,
    decision,
    assessmentReferences: [
      { assessmentKind: 'integrity', assessmentId: 'assess-001', semanticHash: 'hash-assess-001' },
    ],
    policyReference: POLICY_REF,
    recordedAt: ISSUED_AT,
    ...overrides,
  }
}

// ─── Quarantine request ───────────────────────────────────────────────────────

const QUARANTINE_POLICY: PackageQuarantinePolicy = {
  policyId: POLICY_ID,
  policyVersion: POLICY_VERSION,
  quarantineDenied: true,
  quarantineManualReview: false,
  quarantineConditionallyTrusted: false,
  allowedModes: ['isolate'],
  defaultMode: 'isolate',
  requireSourceSeal: false,
  requireDestinationVerification: false,
  requireIdentityContinuity: false,
  requireAtomicMove: false,
  allowCopyFallback: true,
  allowDegradedContainment: false,
  allowManualContainment: false,
  locationRules: [],
  retentionPolicy: {},
}

const QUARANTINE_ARTIFACT: QuarantineArtifactRef = {
  artifactId: 'artifact-t15-001',
  packageId: PACKAGE_ID,
  version: PACKAGE_VERSION,
  sourceLocation: '/tmp/test-package',
  observedDigest: ARTIFACT_DIGEST,
}

const QUARANTINE_CONTEXT: PackageQuarantineContext = {
  tenantId: TENANT_ID,
  environmentId: ENVIRONMENT_ID,
}

export function makeQuarantineRequest(overrides: Partial<PackageQuarantineRequest> = {}): PackageQuarantineRequest {
  return {
    operationId: OPERATION_ID_2,
    subject: CANONICAL_SUBJECT,
    trustDecision: 'denied',
    artifact: QUARANTINE_ARTIFACT,
    policy: QUARANTINE_POLICY,
    context: QUARANTINE_CONTEXT,
    requestedAt: ISSUED_AT,
    ...overrides,
  }
}

// ─── Provisioning authorization fixtures ─────────────────────────────────────

export const AUTH_POLICY: PackageProvisioningAuthorizationPolicy = {
  policyId: POLICY_ID,
  policyVersion: POLICY_VERSION,
  allowedTrustOutcomes: ['trusted', 'conditionally-trusted'],
  allowConditionalTrust: true,
  requireCurrentReevaluation: false,
  denyWhenQuarantineStateUnknown: true,
  denyOnRepositoryIntegrityWarning: false,
  allowManualRecovery: false,
  allowDowngrade: false,
  authorizationTtlSeconds: 3600,
  singleUseAuthorization: false,
  maxCapabilityScope: [],
  maxPermissionScope: [],
}

export function makeAuthorizationRequest(overrides: Partial<PackageProvisioningAuthorizationRequest> = {}): PackageProvisioningAuthorizationRequest {
  return {
    requestId: 'req-t15-001',
    operationId: 'op-auth-001',
    subject: CANONICAL_SUBJECT,
    artifactIdentity: ARTIFACT_IDENTITY,
    packageVersion: PACKAGE_VERSION,
    tenantId: TENANT_ID,
    environmentId: ENVIRONMENT_ID,
    provisioningMode: 'install',
    requestedCapabilities: [],
    requestedPermissions: [],
    policyReference: POLICY_REF,
    requestedAt: ISSUED_AT,
    ...overrides,
  }
}

export function makeTrustSnapshot(decision: import('@rohinik-org/package-trust-ir').PackageTrustDecision = 'trusted'): PackageProvisioningTrustSnapshot {
  return {
    subject: CANONICAL_SUBJECT,
    artifactIdentity: ARTIFACT_IDENTITY,
    trustDecision: decision,
    trustDecisionRecordId: RECORD_ID_1,
    decisionEffectiveAt: EVALUATED_AT,
    policyReference: POLICY_REF,
    quarantineState: decision === 'quarantined' ? 'quarantined' : 'not-quarantined',
    reevaluationState: 'not-required',
    repositoryRevision: 1,
    snapshotAsOf: ISSUED_AT,
    superseded: false,
    current: true,
  }
}
