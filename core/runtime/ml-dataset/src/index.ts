// @rohinik-org/ml-dataset — Dataset governance ports and contracts.
// Zero implementation: all repositories are structural interfaces (ports).
// Stage 12A identities are consumed, never redefined.

import type {
  DatasetId, PartitionId, FeatureSchemaId,
  DatasetManifest, DatasetVersion, DatasetPartition, DatasetProvenance,
  FeatureSchema, TransformationLineage,
  ContentHash, IsoTimestamp, JsonValue,
} from '@rohinik-org/ml-ir'

// Re-export stage-12A types consumed by this package so callers need only one import.
export type {
  DatasetId, PartitionId, FeatureSchemaId,
  DatasetManifest, DatasetVersion, DatasetPartition, DatasetProvenance,
  FeatureSchema, TransformationLineage,
  ContentHash, JsonValue,
}

// ── IsoTimestamp alias ────────────────────────────────────────────────────────
// ponytail: alias not redefined — ml-ir owns the brand
export type DatasetIsoTimestamp = IsoTimestamp

// ── Governance context ────────────────────────────────────────────────────────
// Injected per request — never sourced from Date.now() or env globals.

export interface DatasetGovernanceContext {
  readonly tenantId:               string
  readonly environmentId:          string
  readonly requestedAt:            DatasetIsoTimestamp
  readonly requestingPrincipalId:  string
}

// ── Repository write primitives ───────────────────────────────────────────────

export interface RepositoryWriteResult {
  readonly stored:    boolean
  readonly conflict:  boolean
}

export interface RepositoryWriteOptions {
  readonly idempotencyKey:    string
  readonly expectedRevision?: number
}

// ── Repository ports ──────────────────────────────────────────────────────────
// Pure structural contracts — no storage engine, ORM, or cloud SDK leaks in.

export interface DatasetManifestRepository {
  save(manifest: DatasetManifest, opts: RepositoryWriteOptions): Promise<RepositoryWriteResult>
  findById(datasetId: DatasetId): Promise<DatasetManifest | undefined>
}

export interface DatasetVersionRepository {
  save(version: DatasetVersion, opts: RepositoryWriteOptions): Promise<RepositoryWriteResult>
  findByIdAndVersion(datasetId: DatasetId, version: string): Promise<DatasetVersion | undefined>
  listVersions(datasetId: DatasetId): Promise<readonly DatasetVersion[]>
}

export interface FeatureSchemaRepository {
  save(schema: FeatureSchema, opts: RepositoryWriteOptions): Promise<RepositoryWriteResult>
  findById(featureSchemaId: FeatureSchemaId): Promise<FeatureSchema | undefined>
  listVersions(featureSchemaId: FeatureSchemaId): Promise<readonly FeatureSchema[]>
}

export interface DatasetLineageRepository {
  saveNode(node: LineageNode, opts: RepositoryWriteOptions): Promise<RepositoryWriteResult>
  findNode(datasetId: DatasetId): Promise<LineageNode | undefined>
  findAncestors(datasetId: DatasetId): Promise<readonly LineageNode[]>
  findDescendants(datasetId: DatasetId): Promise<readonly LineageNode[]>
}

export interface DatasetAuthorizationRepository {
  save(record: DatasetAuthorizationRecord, opts: RepositoryWriteOptions): Promise<RepositoryWriteResult>
  findCurrent(datasetId: DatasetId, purpose: string, scope: string): Promise<DatasetAuthorizationRecord | undefined>
  listForDataset(datasetId: DatasetId): Promise<readonly DatasetAuthorizationRecord[]>
}

export interface LeakageRepository {
  save(report: LeakageReport, opts: RepositoryWriteOptions): Promise<RepositoryWriteResult>
  findByDatasetId(datasetId: DatasetId): Promise<LeakageReport | undefined>
}

export interface DeletionImpactRepository {
  save(record: DeletionImpactRecord, opts: RepositoryWriteOptions): Promise<RepositoryWriteResult>
  findByDatasetId(datasetId: DatasetId): Promise<DeletionImpactRecord | undefined>
}

// ── Domain types needed by repository ports ───────────────────────────────────
// Minimal shapes sufficient for Task 1 ports. Tasks 2–9 will extend.

export interface LineageNode {
  readonly datasetId:              DatasetId
  readonly parentDatasetIds:       readonly DatasetId[]
  readonly transformationId?:      string
  readonly lineageHash:            ContentHash
  readonly recordedAt:             DatasetIsoTimestamp
}

export type DatasetAuthorizationOutcome =
  | 'AUTHORIZED'
  | 'CONDITIONALLY_AUTHORIZED'
  | 'MANUAL_REVIEW_REQUIRED'
  | 'DENIED'
  | 'EXPIRED'
  | 'REVOKED'

export interface DatasetAuthorizationRecord {
  readonly authorizationId:    string
  readonly datasetId:          DatasetId
  readonly purpose:            string
  readonly scope:              string
  readonly outcome:            DatasetAuthorizationOutcome
  readonly policyReferenceIds: readonly string[]
  readonly decidedAt:          DatasetIsoTimestamp
  readonly expiresAt?:         DatasetIsoTimestamp
  readonly conditionIds?:      readonly string[]
}

export type LeakageSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
export type LeakageKind = 'DIRECT_RECORD' | 'SUBJECT' | 'TEMPORAL' | 'FEATURE' | 'LABEL' | 'TRANSFORMATION'

export interface LeakageFinding {
  readonly kind:       LeakageKind
  readonly severity:   LeakageSeverity
  readonly evidenceRef: string
}

export interface LeakageReport {
  readonly reportId:     string
  readonly datasetId:    DatasetId
  readonly findings:     readonly LeakageFinding[]
  readonly assessedAt:   DatasetIsoTimestamp
  readonly reportHash:   ContentHash
}

export interface DeletionImpactRecord {
  readonly directiveId:               string
  readonly datasetId:                 DatasetId
  readonly affectedDescendantIds:     readonly DatasetId[]
  readonly affectedTrainingRunIds:    readonly string[]
  readonly affectedModelIds:          readonly string[]
  readonly computedAt:                DatasetIsoTimestamp
  readonly impactHash:                ContentHash
}

// ── DatasetGovernanceService (top-level port) ─────────────────────────────────

export interface DatasetGovernanceService {
  readonly manifests:        DatasetManifestRepository
  readonly versions:         DatasetVersionRepository
  readonly featureSchemas:   FeatureSchemaRepository
  readonly lineage:          DatasetLineageRepository
  readonly authorizations:   DatasetAuthorizationRepository
  readonly leakage:          LeakageRepository
  readonly deletionImpacts:  DeletionImpactRepository
}

// ── Error codes ───────────────────────────────────────────────────────────────

export const DATASET_GOVERNANCE_ERROR_CODES = [
  'DATASET_MANIFEST_INVALID',
  'DATASET_MANIFEST_HASH_MISMATCH',
  'DATASET_MANIFEST_MISSING_PROVENANCE',
  'DATASET_MANIFEST_MISSING_AUTHORIZATION',
  'DATASET_VERSION_CONFLICT',
  'DATASET_VERSION_NOT_FOUND',
  'DATASET_VERSION_IMMUTABLE',
  'DATASET_VERSION_INVALID_TRANSITION',
  'DATASET_VERSION_TERMINAL',
  'DATASET_PARTITION_DUPLICATE',
  'DATASET_PARTITION_INVALID_PURPOSE',
  'FEATURE_SCHEMA_INVALID',
  'FEATURE_SCHEMA_DUPLICATE_NAME',
  'FEATURE_SCHEMA_INVALID_TARGET',
  'FEATURE_SCHEMA_INCOMPATIBLE',
  'FEATURE_SCHEMA_SENSITIVE_REMOVAL',
  'LINEAGE_CYCLE_DETECTED',
  'LINEAGE_MISSING_INPUT',
  'LINEAGE_CONFLICT',
  'DATASET_AUTHORIZATION_DENIED',
  'DATASET_AUTHORIZATION_EXPIRED',
  'DATASET_AUTHORIZATION_REVOKED',
  'DATASET_AUTHORIZATION_WRONG_PURPOSE',
  'DATASET_AUTHORIZATION_WRONG_SCOPE',
  'LEAKAGE_BLOCKS_ADMISSION',
  'LEAKAGE_DETECTOR_UNAVAILABLE',
  'DELETION_MISSING_AUTHORIZATION',
  'DELETION_LEGAL_HOLD',
  'DELETION_RETENTION_PENDING',
  'ADMISSION_DELETED_VERSION',
  'ADMISSION_LINEAGE_INCOMPLETE',
  'ADMISSION_SCHEMA_INCOMPATIBLE',
  'REPOSITORY_CONFLICT',
] as const

export type DatasetGovernanceErrorCode = typeof DATASET_GOVERNANCE_ERROR_CODES[number]

export interface DatasetGovernanceError {
  readonly code:     DatasetGovernanceErrorCode
  readonly message:  string
  readonly details?: JsonValue
}

export function makeDatasetGovernanceError(
  code: DatasetGovernanceErrorCode,
  message: string,
  details?: JsonValue,
): DatasetGovernanceError {
  return details !== undefined ? { code, message, details } : { code, message }
}
