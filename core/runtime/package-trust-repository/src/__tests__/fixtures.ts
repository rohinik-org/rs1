// Shared test fixtures for package-trust-repository tests

import type {
  PackageTrustDecisionRecord,
  PackageQuarantineRecord,
  PackageTrustEventRecord,
  RecordTrustDecisionCommand,
  RecordQuarantineResultCommand,
  AppendTrustEventCommand,
  RecordSupersessionCommand,
  ArtifactIdentity,
  PolicyReference,
  AssessmentReference,
  RepositoryRecordId,
  OperationId,
  RepositoryRevision,
} from '../types.js'
import type { PackageTrustSubject } from '@rohinik-org/package-trust-ir'

export const PKG_ID = 'pkg-alpha'
export const PKG_VER = '1.0.0'
export const ARTIFACT_DIGEST = 'sha256:aaaa1111'
export const RECORD_ID_1 = 'rec-001' as RepositoryRecordId
export const RECORD_ID_2 = 'rec-002' as RepositoryRecordId
export const RECORD_ID_3 = 'rec-003' as RepositoryRecordId
export const OP_ID_1     = 'op-001' as OperationId
export const OP_ID_2     = 'op-002' as OperationId
export const OP_ID_3     = 'op-003' as OperationId

export const TIMESTAMP_1 = '2026-01-01T00:00:00.000Z'
export const TIMESTAMP_2 = '2026-01-02T00:00:00.000Z'
export const TIMESTAMP_3 = '2026-01-03T00:00:00.000Z'

export function makeSubject(overrides: Partial<PackageTrustSubject> = {}): PackageTrustSubject {
  return {
    subjectKind: 'rohinik-package',
    packageId:   PKG_ID,
    version:     PKG_VER,
    sourceIdentity: {
      sourceKind: 'npm-registry',
      registryId: 'registry-1',
      artifactLocator: `${PKG_ID}@${PKG_VER}`,
    },
    expectedIntegrity: { algorithm: 'sha256', encoding: 'hex', value: ARTIFACT_DIGEST },
    ...overrides,
  }
}

export function makeArtifactIdentity(overrides: Partial<ArtifactIdentity> = {}): ArtifactIdentity {
  return {
    packageId:      PKG_ID,
    version:        PKG_VER,
    artifactDigest: ARTIFACT_DIGEST,
    ...overrides,
  }
}

export function makePolicyRef(overrides: Partial<PolicyReference> = {}): PolicyReference {
  return {
    policyId:      'policy-001',
    policyVersion: '1.0',
    semanticHash:  'hash-policy-001',
    ...overrides,
  }
}

export function makeAssessmentRef(id: string = 'assess-001'): AssessmentReference {
  return { assessmentKind: 'integrity', assessmentId: id, semanticHash: `hash-${id}` }
}

export function makeRecordTrustDecisionCommand(overrides: Partial<RecordTrustDecisionCommand> = {}): RecordTrustDecisionCommand {
  return {
    operationId:          OP_ID_1,
    recordId:             RECORD_ID_1,
    subject:              makeSubject(),
    artifactIdentity:     makeArtifactIdentity(),
    decision:             'trusted',
    assessmentReferences: [makeAssessmentRef()],
    policyReference:      makePolicyRef(),
    recordedAt:           TIMESTAMP_1,
    ...overrides,
  }
}

export function makeRecordQuarantineCommand(overrides: Partial<RecordQuarantineResultCommand> = {}): RecordQuarantineResultCommand {
  return {
    operationId:           OP_ID_2,
    recordId:              RECORD_ID_2,
    subject:               makeSubject(),
    artifactIdentity:      makeArtifactIdentity(),
    trustDecisionRecordId: RECORD_ID_1,
    quarantineResult:      { status: 'active', reasonCodes: ['integrity-mismatch'] },
    policyReference:       makePolicyRef(),
    recordedAt:            TIMESTAMP_1,
    ...overrides,
  }
}

export function makeAppendEventCommand(overrides: Partial<AppendTrustEventCommand> = {}): AppendTrustEventCommand {
  return {
    operationId: 'op-evt-001' as OperationId,
    eventId:     'evt-001',
    eventType:   'trust-decision-recorded',
    subject:     makeSubject(),
    payload:     { note: 'test' },
    occurredAt:  TIMESTAMP_1,
    recordedAt:  TIMESTAMP_1,
    ...overrides,
  }
}

export function makeSupersessionCommand(overrides: Partial<RecordSupersessionCommand> = {}): RecordSupersessionCommand {
  return {
    operationId:       'op-sup-001' as OperationId,
    priorRecordId:     RECORD_ID_1,
    successorRecordId: RECORD_ID_2,
    reason:            'policy-update',
    recordedAt:        TIMESTAMP_2,
    ...overrides,
  }
}
