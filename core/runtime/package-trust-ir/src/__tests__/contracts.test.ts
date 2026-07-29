import { describe, it, expect, expectTypeOf } from 'vitest'
import type {
  PackageTrustSubject,
  AcquisitionAuthorization,
  AcquisitionAuthorizationId,
  ExpectedIntegrityEvidence,
  InertArtifactHandle,
  StagingId,
  PackageTrustPolicySnapshot,
  TrustRootSnapshot,
  RevocationSnapshot,
  EnforcementProfileSnapshot,
  TrustEvaluationContext,
  PackageTrustEvaluationRequest,
  PackageTrustDecisionRecord,
  TrustDecisionId,
  TrustDecisionSemanticHash,
  ArtifactTrustEvidenceBundle,
  TrustEvidenceSemanticHash,
  PackageTrustEvaluationResult,
  QuarantineRecord,
  QuarantineId,
  PackageTrustRepositoryRecord,
  IntegrityDigest,
  IntegrityAssessment,
  PermissionPolicyRule,
  PermissionAssessment,
  VulnerabilityAssessment,
  QuarantineReleaseResult,
  RuntimePermissionGrant,
  ConditionalPermission,
  CanonicalPermission,
} from '../index.js'

// ─── Shared fixtures ─────────────────────────────────────────────────────────

const digest: IntegrityDigest = {
  algorithm: 'sha256',
  encoding: 'hex',
  value: 'a'.repeat(64),
}

const subject: PackageTrustSubject = {
  subjectKind: 'language-dependency',
  packageId: 'lodash',
  version: '4.17.21',
  sourceIdentity: {
    sourceKind: 'npm-registry',
    registryId: 'npmjs.org',
    artifactLocator: 'lodash@4.17.21',
  },
  expectedIntegrity: digest,
}

const auth: AcquisitionAuthorization = {
  acquisitionAuthorizationId: 'auth-1' as AcquisitionAuthorizationId,
  subject,
  issuedAt: '2026-07-29T00:00:00.000Z',
  expiresAt: '2026-08-29T00:00:00.000Z',
}

const evidence: ExpectedIntegrityEvidence = {
  subject,
  expectedIntegrity: digest,
  authority: {
    authorityKind: 'content-addressed-reference',
    storeId: 'store-1',
  },
  authorizationId: 'auth-1',
}

const handle: InertArtifactHandle = {
  stagingId: 'staging-1' as StagingId,
  subject,
  relativeArtifactPath: 'artifact.tgz',
  sizeBytes: 1024,
  acquiredFrom: subject.sourceIdentity,
}

const policy: PackageTrustPolicySnapshot = {
  policyId: 'p1',
  policyVersion: '1',
  semanticHash: 'ps',
  sourceRules: [{ order: 1, sourceKind: 'npm-registry', effect: 'allow' }],
  publisherRules: [],
  signatureRules: [],
  provenanceRules: [],
  permissionRules: [],
  vulnerabilityRules: [],
  unknownSourceDecision: 'deny',
  unknownPublisherDecision: 'deny',
  missingRevocationDataDecision: 'deny',
}

const trustRoot: TrustRootSnapshot = {
  snapshotId: 'tr1',
  semanticHash: 'trs',
  createdAt: '2026-01-01T00:00:00.000Z',
  issuers: [],
  namespaceBindings: [],
}

const revocation: RevocationSnapshot = {
  snapshotId: 'r1',
  semanticHash: 'rss',
  issuedAt: '2026-01-01T00:00:00.000Z',
  entries: [],
}

const enforcementProfile: EnforcementProfileSnapshot = {
  profileId: 'ep1',
  semanticHash: 'eps',
  capabilities: [{ domain: 'fs', enforced: true }],
}

const context: TrustEvaluationContext = {
  policySnapshot: policy,
  trustRootSnapshot: trustRoot,
  revocationSnapshot: revocation,
  enforcementProfile,
}

const request: PackageTrustEvaluationRequest = {
  subject,
  acquisitionAuthorization: auth,
  handle,
  expectedIntegrityEvidence: evidence,
  context,
  evaluatedAt: '2026-07-29T10:00:00.000Z',
}

const decisionRecord: PackageTrustDecisionRecord = {
  decisionId: 'dec-1' as TrustDecisionId,
  subject,
  subjectHash: 'sh-1',
  decision: 'trusted',
  reasonCodes: [],
  policySemanticHash: 'ps',
  trustRootSnapshotSemanticHash: 'trs',
  enforcementProfileSemanticHash: 'eps',
  evaluatedAt: '2026-07-29T10:00:00.000Z',
  decisionSemanticHash: 'dsh' as TrustDecisionSemanticHash,
}

const evidenceBundle: ArtifactTrustEvidenceBundle = {
  bundleVersion: 1,
  subject,
  trustDecisionId: 'dec-1' as TrustDecisionId,
  semanticHash: 'eh' as TrustEvidenceSemanticHash,
}

const result: PackageTrustEvaluationResult = {
  decision: decisionRecord,
  evidence: evidenceBundle,
}

const quarantineRecord: QuarantineRecord = {
  quarantineId: 'q1' as QuarantineId,
  subject,
  reasonCodes: ['integrity-mismatch'],
  placedAt: '2026-07-29T10:00:00.000Z',
  evidenceSemanticHash: 'eh',
  status: 'active',
}

const repoRecord: PackageTrustRepositoryRecord = {
  sequence: 0,
  decision: decisionRecord,
  evidenceSemanticHash: 'eh',
  recordHash: 'rh',
}

// ─── Structural contract tests ────────────────────────────────────────────────

describe('PackageTrustEvaluationRequest structure', () => {
  it('contains acquisitionAuthorization', () => {
    expect(request.acquisitionAuthorization).toBeDefined()
  })

  it('contains handle', () => {
    expect(request.handle).toBeDefined()
  })

  it('contains expectedIntegrityEvidence', () => {
    expect(request.expectedIntegrityEvidence).toBeDefined()
  })

  it('contains context (not flat snapshots)', () => {
    expect(request.context.policySnapshot).toBeDefined()
    expect(request.context.trustRootSnapshot).toBeDefined()
  })
})

describe('PackageTrustEvaluationResult structure', () => {
  it('wraps decision and evidence', () => {
    expect(result.decision).toBeDefined()
    expect(result.evidence).toBeDefined()
  })

  it('permissionGrant is optional', () => {
    const noGrant: PackageTrustEvaluationResult = { decision: decisionRecord, evidence: evidenceBundle }
    expect(noGrant.permissionGrant).toBeUndefined()
  })
})

describe('IntegrityAssessment', () => {
  it('uses IntegrityDigest for observedIntegrity — not bare string', () => {
    const a: IntegrityAssessment = {
      passed: true,
      expectedIntegrity: digest,
      observedIntegrity: { algorithm: 'sha256', encoding: 'hex', value: 'b'.repeat(64) },
    }
    expect(a.observedIntegrity?.algorithm).toBe('sha256')
  })
})

describe('PermissionPolicyRule', () => {
  it('uses conditionId — no condition field', () => {
    const rule: PermissionPolicyRule = {
      order: 1,
      domain: 'fs',
      effect: 'conditional',
      conditionId: 'cond-sandbox',
    }
    expect(rule.conditionId).toBe('cond-sandbox')
    expect(Object.keys(rule)).not.toContain('condition')
  })
})

describe('PermissionAssessment decision values', () => {
  it('accepts conditionally-granted', () => {
    const a: PermissionAssessment = {
      manifestSemanticHash: 'msh',
      declaredPermissions: [],
      grantedPermissions: [],
      deniedPermissions: [],
      enforcementAssessment: { enforceable: true, capabilities: [], unenforceablePermissions: [] },
      decision: 'conditionally-granted',
    }
    expect(a.decision).toBe('conditionally-granted')
  })
})

describe('VulnerabilityAssessment', () => {
  it('does not contain passed field', () => {
    const va: VulnerabilityAssessment = {
      findings: [],
      scannerSemanticHash: 'ssh',
    }
    expect(Object.keys(va)).not.toContain('passed')
  })
})

describe('PackageTrustRepositoryRecord', () => {
  it('wraps the complete decision record', () => {
    expect(repoRecord.decision).toBeDefined()
    expect(repoRecord.decision.decisionId).toBe('dec-1')
    expect(repoRecord.evidenceSemanticHash).toBeDefined()
    expect(repoRecord.recordHash).toBeDefined()
  })
})

describe('QuarantineReleaseResult', () => {
  it('uses QuarantineReleaseResult shape', () => {
    const releaseResult: QuarantineReleaseResult = {
      record: { ...quarantineRecord, status: 'released-for-reevaluation' },
      requiresReacquisition: true,
    }
    expect(releaseResult.requiresReacquisition).toBe(true)
  })
})

describe('RuntimePermissionGrant', () => {
  it('separates granted and conditional permissions', () => {
    const perm: CanonicalPermission = { domain: 'fs', value: 'read' }
    const cond: ConditionalPermission = { permission: perm, conditionId: 'cond-1' }
    const grant: RuntimePermissionGrant = {
      grantId: 'g1',
      decisionId: 'dec-1' as TrustDecisionId,
      subject,
      grantedPermissions: [perm],
      conditionalPermissions: [cond],
      grantedAt: '2026-07-29T10:00:00.000Z',
      grantSemanticHash: 'gsh',
    }
    expect(grant.grantedPermissions).toHaveLength(1)
    expect(grant.conditionalPermissions[0]?.conditionId).toBe('cond-1')
  })
})
