import type {
  PackageTrustDecisionRequest,
  PackageTrustPolicy,
  TrustRule,
  AssessmentType,
} from '../types.js'
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
  PackageTrustPolicySnapshot,
  IntegrityDigest,
  ExternalSourceIdentity,
} from '@rohinik-org/package-trust-ir'

export const DIGEST: IntegrityDigest = { algorithm: 'sha256', encoding: 'hex', value: 'a'.repeat(64) }
export const SOURCE: ExternalSourceIdentity = {
  sourceKind: 'npm-registry',
  registryId: 'registry.example.com',
  artifactLocator: 'pkg/-/pkg-1.0.0.tgz',
}

export function makeSubject(overrides?: Partial<PackageTrustSubject>): PackageTrustSubject {
  return {
    subjectKind: 'language-dependency',
    packageId: 'pkg',
    version: '1.0.0',
    sourceIdentity: SOURCE,
    expectedIntegrity: DIGEST,
    ...overrides,
  }
}

export function makeIntegrityAssessment(overrides?: Partial<IntegrityAssessment>): IntegrityAssessment {
  return { passed: true, expectedIntegrity: DIGEST, observedIntegrity: DIGEST, ...overrides }
}

export function makeSignatureAssessment(overrides?: Partial<SignatureAssessment>): SignatureAssessment {
  return { passed: true, issuerId: 'issuer-1', keyId: 'key-1', ...overrides }
}

export function makePublisherAssessment(overrides?: Partial<PublisherAssessment>): PublisherAssessment {
  return { decision: 'accepted', ...overrides }
}

export function makeRevocationAssessment(overrides?: Partial<RevocationAssessment>): RevocationAssessment {
  return { decision: 'passed', checkedSnapshotSemanticHash: 'hash-1', ...overrides }
}

export function makeProvenanceAssessment(overrides?: Partial<ProvenanceAssessment>): ProvenanceAssessment {
  return { passed: true, builderIdentity: 'builder-1', ...overrides }
}

export function makePermissionAssessment(overrides?: Partial<PermissionAssessment>): PermissionAssessment {
  return {
    manifestSemanticHash: 'manifest-hash',
    declaredPermissions: [],
    grantedPermissions: [],
    deniedPermissions: [],
    enforcementAssessment: { enforceable: true, capabilities: [], unenforceablePermissions: [] },
    decision: 'granted',
    ...overrides,
  }
}

export function makeVulnerabilityAssessment(overrides?: Partial<VulnerabilityAssessment>): VulnerabilityAssessment {
  return { findings: [], scannerSemanticHash: 'scanner-hash', ...overrides }
}

export function makePolicySnapshot(overrides?: Partial<PackageTrustPolicySnapshot>): PackageTrustPolicySnapshot {
  return {
    policyId: 'policy-1',
    policyVersion: '1',
    semanticHash: 'policy-hash',
    sourceRules: [],
    publisherRules: [],
    signatureRules: [],
    provenanceRules: [],
    permissionRules: [],
    vulnerabilityRules: [],
    unknownSourceDecision: 'deny',
    unknownPublisherDecision: 'deny',
    missingRevocationDataDecision: 'deny',
    ...overrides,
  }
}

export function makeContext(overrides?: Partial<TrustEvaluationContext>): TrustEvaluationContext {
  return {
    policySnapshot: makePolicySnapshot(),
    trustRootSnapshot: {
      snapshotId: 'root-1',
      semanticHash: 'root-hash',
      createdAt: '2024-01-01T00:00:00Z',
      issuers: [],
      namespaceBindings: [],
    },
    enforcementProfile: {
      profileId: 'profile-1',
      semanticHash: 'enforcement-hash',
      capabilities: [],
    },
    ...overrides,
  }
}

export function makeRule(id: string, overrides?: Partial<TrustRule>): TrustRule {
  return {
    ruleId: id,
    specificity: 'global',
    effect: 'allow',
    ...overrides,
  }
}

export function makePolicy(overrides?: Partial<PackageTrustPolicy>): PackageTrustPolicy {
  return {
    policyId: 'policy-1',
    policyVersion: '1.0',
    snapshot: makePolicySnapshot(),
    requiredAssessments: ['integrity', 'signature', 'publisher', 'revocation', 'provenance', 'permission', 'vulnerability'] as AssessmentType[],
    allowDegradedTrust: false,
    hardRejectRules: [],
    manualReviewRules: [],
    degradedRules: [],
    advisoryRules: [],
    ...overrides,
  }
}

export function makeRequest(overrides?: Partial<PackageTrustDecisionRequest>): PackageTrustDecisionRequest {
  return {
    subject: makeSubject(),
    integrityAssessment: makeIntegrityAssessment(),
    signatureAssessment: makeSignatureAssessment(),
    publisherAssessment: makePublisherAssessment(),
    revocationAssessment: makeRevocationAssessment(),
    provenanceAssessment: makeProvenanceAssessment(),
    permissionAssessment: makePermissionAssessment(),
    vulnerabilityAssessment: makeVulnerabilityAssessment(),
    policy: makePolicy(),
    context: makeContext(),
    evaluatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  }
}
