import type {
  PackageTrustSubject,
  PackageTrustDecision,
  QuarantineStatus,
} from '@rohinik-org/package-trust-ir'

// ─── Branded repository types ─────────────────────────────────────────────────

export type RepositoryRecordId = string & { readonly __brand: 'RepositoryRecordId' }
export type OperationId        = string & { readonly __brand: 'OperationId' }
export type RepositoryRevision = number & { readonly __brand: 'RepositoryRevision' }
export type PartitionKey       = string & { readonly __brand: 'PartitionKey' }
export type CursorToken        = string & { readonly __brand: 'CursorToken' }

// ─── Artifact identity ────────────────────────────────────────────────────────

export interface ArtifactIdentity {
  readonly packageId:      string
  readonly version:        string
  readonly artifactDigest: string
}

// ─── Policy reference ─────────────────────────────────────────────────────────

export interface PolicyReference {
  readonly policyId:      string
  readonly policyVersion: string
  readonly semanticHash:  string
}

// ─── Evidence reference ───────────────────────────────────────────────────────

export interface EvidenceReference {
  readonly evidenceBundleId:   string
  readonly semanticHash:       string
}

// ─── Assessment reference ─────────────────────────────────────────────────────

export interface AssessmentReference {
  readonly assessmentKind: string
  readonly assessmentId:   string
  readonly semanticHash:   string
}

// ─── Supersession reason ──────────────────────────────────────────────────────

export type SupersessionReason =
  | 'policy-update'
  | 'new-evidence'
  | 'correction'
  | 'reevaluation'
  | 'revocation-change'

// ─── Canonical record types (§9) ─────────────────────────────────────────────

export interface PackageTrustDecisionRecord {
  readonly recordId:              RepositoryRecordId
  readonly operationId:           OperationId
  readonly subject:               PackageTrustSubject
  readonly artifactIdentity:      ArtifactIdentity
  readonly decision:              PackageTrustDecision
  readonly assessmentReferences:  readonly AssessmentReference[]
  readonly policyReference:       PolicyReference
  readonly evidenceReference?:    EvidenceReference
  readonly recordedAt:            string
  readonly effectiveAt:           string
  readonly supersedesRecordId?:   RepositoryRecordId
  readonly repositoryRevision:    RepositoryRevision
  readonly canonicalDigest:       string
}

export interface PackageQuarantineRecord {
  readonly recordId:              RepositoryRecordId
  readonly operationId:           OperationId
  readonly subject:               PackageTrustSubject
  readonly artifactIdentity:      ArtifactIdentity
  readonly trustDecisionRecordId: RepositoryRecordId
  readonly quarantineResult:      QuarantineResultPayload
  readonly policyReference:       PolicyReference
  readonly recordedAt:            string
  readonly effectiveAt:           string
  readonly supersedesRecordId?:   RepositoryRecordId
  readonly repositoryRevision:    RepositoryRevision
  readonly canonicalDigest:       string
}

export interface QuarantineResultPayload {
  readonly status:      QuarantineStatus
  readonly reasonCodes: readonly string[]
}

export type PackageTrustEventType =
  | 'trust-decision-recorded'
  | 'quarantine-recorded'
  | 'supersession-recorded'
  | 'integrity-check-completed'
  | 'projection-rebuilt'
  | 'repository-health-changed'
  | 'retention-policy-evaluated'

export interface PackageTrustEventRecord {
  readonly eventId:              string
  readonly operationId:          OperationId
  readonly eventType:            PackageTrustEventType
  readonly subject:              PackageTrustSubject
  readonly artifactIdentity?:    ArtifactIdentity
  readonly decisionRecordId?:    RepositoryRecordId
  readonly quarantineRecordId?:  RepositoryRecordId
  readonly policyReference?:     PolicyReference
  readonly payload:              Readonly<Record<string, unknown>>
  readonly occurredAt:           string
  readonly recordedAt:           string
  readonly repositoryRevision:   RepositoryRevision
  readonly canonicalDigest:      string
}

export interface RepositoryRecordEnvelope<T> {
  readonly schemaVersion:        string
  readonly recordType:           string
  readonly record:               T
  readonly previousRecordDigest?: string
  readonly canonicalDigest:      string
}

// ─── Write commands (§10) ─────────────────────────────────────────────────────

export interface RecordTrustDecisionCommand {
  readonly operationId:           OperationId
  readonly recordId:              RepositoryRecordId
  readonly subject:               PackageTrustSubject
  readonly artifactIdentity:      ArtifactIdentity
  readonly decision:              PackageTrustDecision
  readonly assessmentReferences:  readonly AssessmentReference[]
  readonly policyReference:       PolicyReference
  readonly evidenceReference?:    EvidenceReference
  readonly recordedAt:            string
  readonly effectiveAt?:          string
  readonly expectedRevision?:     number
}

export interface RecordQuarantineResultCommand {
  readonly operationId:           OperationId
  readonly recordId:              RepositoryRecordId
  readonly subject:               PackageTrustSubject
  readonly artifactIdentity:      ArtifactIdentity
  readonly trustDecisionRecordId: RepositoryRecordId
  readonly quarantineResult:      QuarantineResultPayload
  readonly policyReference:       PolicyReference
  readonly recordedAt:            string
  readonly effectiveAt?:          string
  readonly expectedRevision?:     number
}

export interface AppendTrustEventCommand {
  readonly operationId:                OperationId
  readonly eventId:                    string
  readonly eventType:                  PackageTrustEventType
  readonly subject:                    PackageTrustSubject
  readonly artifactIdentity?:          ArtifactIdentity
  readonly decisionRecordId?:          RepositoryRecordId
  readonly quarantineRecordId?:        RepositoryRecordId
  readonly policyReference?:           PolicyReference
  readonly payload:                    Readonly<Record<string, unknown>>
  readonly occurredAt:                 string
  readonly recordedAt:                 string
  readonly expectedPartitionRevision?: number
}

export interface RecordSupersessionCommand {
  readonly operationId:      OperationId
  readonly priorRecordId:    RepositoryRecordId
  readonly successorRecordId: RepositoryRecordId
  readonly reason:           SupersessionReason
  readonly recordedAt:       string
  readonly expectedRevision?: number
}

// ─── Query contracts (§11) ────────────────────────────────────────────────────

export interface GetCurrentPackageTrustQuery {
  readonly packageId:      string
  readonly version?:       string
  readonly artifactDigest?: string
  readonly tenantId?:      string
  readonly environmentId?: string
  readonly asOf?:          string
}

export interface GetPackageTrustHistoryQuery {
  readonly packageId:      string
  readonly version?:       string
  readonly artifactDigest?: string
  readonly from?:          string
  readonly to?:            string
  readonly cursor?:        CursorToken
  readonly limit?:         number
}

export interface GetTrustDecisionRecordQuery {
  readonly recordId: RepositoryRecordId
}

export interface GetPackageQuarantineStateQuery {
  readonly packageId:      string
  readonly version?:       string
  readonly artifactDigest?: string
  readonly asOf?:          string
}

export interface FindReevaluationCandidatesQuery {
  readonly changedPolicyIds?:         readonly string[]
  readonly changedAdvisoryIds?:       readonly string[]
  readonly changedPublisherIds?:      readonly string[]
  readonly changedRevocationTargets?: readonly string[]
  readonly olderThan?:               string
  readonly cursor?:                  CursorToken
  readonly limit?:                   number
}

export interface GetProvisioningTrustSnapshotQuery {
  readonly packageId:      string
  readonly version?:       string
  readonly artifactDigest?: string
  readonly tenantId?:      string
  readonly environmentId?: string
  readonly asOf:           string
}

// ─── Query result types ───────────────────────────────────────────────────────

export interface RepositoryPage<T> {
  readonly items:      readonly T[]
  readonly nextCursor?: CursorToken
  readonly total?:     number
}

export interface CurrentTrustState {
  readonly record?:           PackageTrustDecisionRecord
  readonly quarantineRecord?: PackageQuarantineRecord
  readonly repositoryRevision: RepositoryRevision
  readonly asOf:              string
}

export interface ProvisioningTrustSnapshot {
  readonly trustDecisionRecord?: PackageTrustDecisionRecord
  readonly quarantineRecord?:    PackageQuarantineRecord
  readonly trustRevision:        RepositoryRevision
  readonly quarantineRevision:   RepositoryRevision
  readonly policyReferences:     readonly PolicyReference[]
  readonly supersessionState:    'none' | 'superseded' | 'successor'
  readonly repositoryHealth:     RepositoryHealthState
  readonly asOf:                 string
}

export interface ReevaluationCandidate {
  readonly record:        PackageTrustDecisionRecord
  readonly matchedReason: string
}

// ─── Write receipt ────────────────────────────────────────────────────────────

export interface RepositoryWriteReceipt {
  readonly operationId:  OperationId
  readonly recordId:     RepositoryRecordId
  readonly revision:     RepositoryRevision
  readonly recordedAt:   string
  readonly idempotent:   boolean
}

export interface QuarantineWriteReceipt {
  readonly operationId:  OperationId
  readonly recordId:     RepositoryRecordId
  readonly revision:     RepositoryRevision
  readonly recordedAt:   string
  readonly idempotent:   boolean
}

export interface SupersessionReceipt {
  readonly operationId:       OperationId
  readonly priorRecordId:     RepositoryRecordId
  readonly successorRecordId: RepositoryRecordId
  readonly revision:          RepositoryRevision
  readonly recordedAt:        string
  readonly idempotent:        boolean
}

// ─── Repository health ────────────────────────────────────────────────────────

export type RepositoryHealthState =
  | 'healthy'
  | 'degraded'
  | 'read-only'
  | 'integrity-warning'
  | 'integrity-failed'
  | 'migration-required'
  | 'unavailable'

export interface RepositoryHealthStatus {
  readonly state:        RepositoryHealthState
  readonly checkedAt:    string
  readonly details?:     string
}

// ─── Retention classification ─────────────────────────────────────────────────

export type RetentionClassification =
  | 'retain'
  | 'archive-eligible'
  | 'legal-hold'
  | 'deletion-prohibited'
  | 'destruction-eligible'

export interface RetentionMetadata {
  readonly recordId:        RepositoryRecordId
  readonly classification:  RetentionClassification
  readonly evaluatedAt:     string
  readonly reason?:         string
}

// ─── Integrity report ─────────────────────────────────────────────────────────

export interface IntegrityFinding {
  readonly kind:      'digest-mismatch' | 'broken-chain' | 'missing-revision' | 'duplicate-revision'
                    | 'missing-reference' | 'supersession-cycle' | 'projection-mismatch'
                    | 'event-linkage-mismatch' | 'index-inconsistency'
  readonly recordId?: RepositoryRecordId
  readonly detail:    string
}

export interface IntegrityReport {
  readonly valid:     boolean
  readonly findings:  readonly IntegrityFinding[]
  readonly checkedAt: string
}

// ─── Supersession link ────────────────────────────────────────────────────────

export interface SupersessionLink {
  readonly priorRecordId:     RepositoryRecordId
  readonly successorRecordId: RepositoryRecordId
  readonly reason:            SupersessionReason
  readonly recordedAt:        string
}

// ─── Conflict errors ──────────────────────────────────────────────────────────

export type WriteConflictKind =
  | 'idempotency-conflict'
  | 'revision-conflict'
  | 'referential-integrity-failure'
  | 'supersession-cycle'
  | 'self-supersession'
  | 'cross-subject-supersession'
  | 'command-validation-failure'
  | 'record-validation-failure'
  | 'integrity-failure'
  | 'payload-too-large'
  | 'secret-field-rejected'
  | 'partition-traversal-rejected'

export class RepositoryWriteConflict extends Error {
  override readonly name = 'RepositoryWriteConflict'
  constructor(
    public readonly kind:    WriteConflictKind,
    public readonly detail:  string,
    public readonly operationId?: OperationId,
  ) {
    super(`[${kind}] ${detail}`)
  }
}

// ─── Lineage record ───────────────────────────────────────────────────────────

export interface LineageRecord {
  readonly packageId:          string
  readonly version:            string
  readonly artifactDigest:     string
  readonly trustDecisionIds:   readonly RepositoryRecordId[]
  readonly quarantineIds:      readonly RepositoryRecordId[]
  readonly supersessionLinks:  readonly SupersessionLink[]
}

// ─── Backup / restore ─────────────────────────────────────────────────────────

export interface RepositoryBackup {
  readonly schemaVersion:    string
  readonly backupAt:         string
  readonly trustRecords:     readonly PackageTrustDecisionRecord[]
  readonly quarantineRecords: readonly PackageQuarantineRecord[]
  readonly eventRecords:     readonly PackageTrustEventRecord[]
  readonly supersessionLinks: readonly SupersessionLink[]
  readonly projections:      readonly CurrentTrustState[]
  readonly health:           RepositoryHealthStatus
}

// ─── Repository clock port ────────────────────────────────────────────────────

export interface RepositoryClock {
  now(): string
}
