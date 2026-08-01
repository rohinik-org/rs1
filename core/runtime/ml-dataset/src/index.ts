// @rohinik-org/ml-dataset — Dataset governance ports and contracts.
// Zero implementation: all repositories are structural interfaces (ports).
// Stage 12A identities are consumed, never redefined.

import type {
  DatasetId, PartitionId, FeatureSchemaId,
  DatasetManifest, DatasetVersion, DatasetPartition, DatasetProvenance,
  FeatureSchema, TransformationLineage,
  FeatureDefinition, TargetDefinition,
  ContentHash, IsoTimestamp, JsonValue,
} from '@rohinik-org/ml-ir'
import { canonicalMlHash } from '@rohinik-org/ml-ir'

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

// ── Task 4: Feature schema registry and compatibility ─────────────────────────

export type FeatureRole = 'INPUT' | 'IDENTIFIER' | 'TIMESTAMP' | 'SENSITIVE' | 'TARGET'

export interface GovernedFeatureDefinition extends FeatureDefinition {
  readonly role?: FeatureRole
}

export interface GovernedFeatureSchema {
  readonly featureSchemaId: FeatureSchemaId
  readonly name:            string
  readonly features:        readonly GovernedFeatureDefinition[]
  readonly targets:         readonly TargetDefinition[]
  readonly contentHash:     ContentHash
  readonly createdAt:       DatasetIsoTimestamp
}

export type FeatureSchemaCompatibilityOutcome =
  | 'EXACT'
  | 'BACKWARD_COMPATIBLE'
  | 'FORWARD_COMPATIBLE'
  | 'INCOMPATIBLE'
  | 'REQUIRES_REVIEW'

export interface FeatureSchemaCompatibilityResult {
  readonly outcome:   FeatureSchemaCompatibilityOutcome
  readonly baseline:  FeatureSchemaId
  readonly candidate: FeatureSchemaId
  readonly reasons:   readonly string[]
}

export interface FeatureSchemaRegistry {
  register(schema: GovernedFeatureSchema, opts: RepositoryWriteOptions): Promise<RepositoryWriteResult>
  findById(id: FeatureSchemaId): Promise<GovernedFeatureSchema | undefined>
  listVersions(id: FeatureSchemaId): Promise<readonly GovernedFeatureSchema[]>
  supersede(oldId: FeatureSchemaId, newSchema: GovernedFeatureSchema, opts: RepositoryWriteOptions): Promise<RepositoryWriteResult>
}

// ponytail: throws DatasetGovernanceError-shaped object so callers can read .code
export function validateFeatureSchema(schema: GovernedFeatureSchema): void {
  const names = schema.features.map(f => f.name)
  const unique = new Set(names)
  if (unique.size !== names.length) {
    throw { ...makeDatasetGovernanceError('FEATURE_SCHEMA_DUPLICATE_NAME', 'Duplicate feature names in schema') }
  }
  if (!schema.targets || schema.targets.length === 0) {
    throw { ...makeDatasetGovernanceError('FEATURE_SCHEMA_INVALID_TARGET', 'Schema must have at least one target') }
  }
}

export function assessSchemaCompatibility(
  baseline: GovernedFeatureSchema,
  candidate: GovernedFeatureSchema,
): FeatureSchemaCompatibilityResult {
  const reasons: string[] = []

  // Index by name for O(n) comparisons
  const bFeats = new Map(baseline.features.map(f => [f.name, f]))
  const cFeats = new Map(candidate.features.map(f => [f.name, f]))
  const bTargs = new Map(baseline.targets.map(t => [t.name, t]))
  const cTargs = new Map(candidate.targets.map(t => [t.name, t]))

  let incompatible   = false
  let requiresReview = false
  let added          = false  // any addition (optional/required)
  let removed        = false  // any removal (non-sensitive)
  let addedRequired  = false
  let removedOptional = false

  // Check target changes — any change is INCOMPATIBLE
  for (const [name, bt] of bTargs) {
    const ct = cTargs.get(name)
    if (!ct) { incompatible = true; reasons.push(`Target removed: ${name}`) }
    else if (bt.dtype !== ct.dtype) { incompatible = true; reasons.push(`Target dtype changed: ${name}`) }
  }
  for (const [name] of cTargs) {
    if (!bTargs.has(name)) { incompatible = true; reasons.push(`Target added: ${name}`) }
  }

  // Check feature changes
  for (const [name, bf] of bFeats) {
    const cf = cFeats.get(name)
    if (!cf) {
      // Feature removed
      if (bf.role === 'SENSITIVE') {
        requiresReview = true
        reasons.push(`Sensitive-role feature removed: ${name}`)
      } else if (bf.role === 'IDENTIFIER' || bf.role === 'TIMESTAMP') {
        incompatible = true
        reasons.push(`Identifier/timestamp feature removed: ${name}`)
      } else if (bf.nullable === true) {
        removedOptional = true
        reasons.push(`Optional feature removed: ${name}`)
      } else {
        // required feature removed — forward compatibility at best, but check further
        removed = true
        reasons.push(`Required feature removed: ${name}`)
      }
    } else {
      // Feature present in both — check for changes
      if (bf.dtype !== cf.dtype) {
        incompatible = true
        reasons.push(`Feature dtype changed: ${name} (${bf.dtype} → ${cf.dtype})`)
      }
      if ((bf.role ?? 'INPUT') !== (cf.role ?? 'INPUT')) {
        incompatible = true
        reasons.push(`Feature role changed: ${name}`)
      }
    }
  }

  for (const [name, cf] of cFeats) {
    if (!bFeats.has(name)) {
      if (cf.nullable === false) {
        addedRequired = true
        incompatible = true
        reasons.push(`Required feature added: ${name}`)
      } else {
        added = true
        reasons.push(`Optional feature added: ${name}`)
      }
    }
  }

  let outcome: FeatureSchemaCompatibilityOutcome
  if (incompatible) {
    outcome = 'INCOMPATIBLE'
  } else if (requiresReview) {
    outcome = 'REQUIRES_REVIEW'
  } else if (reasons.length === 0) {
    outcome = 'EXACT'
  } else if (added && !removedOptional && !removed) {
    outcome = 'BACKWARD_COMPATIBLE'
  } else if ((removedOptional || removed) && !added) {
    outcome = 'FORWARD_COMPATIBLE'
  } else {
    // mixed additions and removals without breaking changes
    outcome = 'REQUIRES_REVIEW'
  }

  return { outcome, baseline: baseline.featureSchemaId, candidate: candidate.featureSchemaId, reasons }
}

// ── Task 2: Manifest validation and immutable registration ────────────────────

// Authoritative fields that provider extensions must not override.
const AUTHORITATIVE_FIELDS = new Set(['datasetId', 'name', 'contentHash', 'recordCount', 'createdAt'])

export interface RegistrationReceipt {
  readonly datasetId:         DatasetId
  readonly version:           string
  readonly registrationHash:  ContentHash
  readonly registeredAt:      DatasetIsoTimestamp
}

// ponytail: throws DatasetGovernanceError (plain object with .code) — matches existing error pattern
export function validateDatasetManifest(
  manifest: DatasetManifest,
  provenance: DatasetProvenance,
  partitions: readonly DatasetPartition[],
): void {
  if (!manifest.name || !manifest.name.trim()) {
    throw makeDatasetGovernanceError('DATASET_MANIFEST_INVALID', 'manifest.name must be non-empty')
  }
  if (manifest.recordCount <= 0) {
    throw makeDatasetGovernanceError('DATASET_MANIFEST_INVALID', 'manifest.recordCount must be > 0')
  }
  if (manifest.provider) {
    for (const key of Object.keys(manifest.provider.metadata)) {
      if (AUTHORITATIVE_FIELDS.has(key)) {
        throw makeDatasetGovernanceError('DATASET_MANIFEST_INVALID', `provider.metadata must not override authoritative field: ${key}`)
      }
    }
  }
  // hash verification: canonical hash of manifest minus contentHash and provider
  const { contentHash: _ch, provider: _p, ...hashable } = manifest
  const expected = canonicalMlHash(hashable) as ContentHash
  if (expected !== manifest.contentHash) {
    throw makeDatasetGovernanceError('DATASET_MANIFEST_HASH_MISMATCH', `contentHash mismatch: expected ${expected}, got ${manifest.contentHash}`)
  }
  if (!provenance.authorizedUsePolicyIds || provenance.authorizedUsePolicyIds.length === 0) {
    throw makeDatasetGovernanceError('DATASET_MANIFEST_MISSING_AUTHORIZATION', 'provenance.authorizedUsePolicyIds must be non-empty')
  }
  // ponytail: Set for O(n) uniqueness check
  const seen = new Set<string>()
  for (const p of partitions) {
    if (seen.has(p.partitionId)) throw makeDatasetGovernanceError('DATASET_PARTITION_DUPLICATE', `duplicate partitionId: ${p.partitionId}`)
    seen.add(p.partitionId)
  }
}

export interface DatasetRegistrationService {
  register(
    manifest: DatasetManifest,
    partitions: readonly DatasetPartition[],
    provenance: DatasetProvenance,
    ctx: DatasetGovernanceContext,
  ): Promise<RegistrationReceipt>
}

export function DatasetRegistrationService(
  manifestRepo: DatasetManifestRepository,
  versionRepo: DatasetVersionRepository,
): DatasetRegistrationService {
  return {
    async register(manifest, partitions, provenance, ctx) {
      validateDatasetManifest(manifest, provenance, partitions)
      const existing = await manifestRepo.findById(manifest.datasetId)
      if (existing !== undefined) {
        if (existing.contentHash !== manifest.contentHash) {
          throw makeDatasetGovernanceError('DATASET_VERSION_CONFLICT',
            `dataset ${manifest.datasetId} already registered with different contentHash`)
        }
        // idempotent: same ID + same hash
        const version = 'v1'
        const registrationHash = canonicalMlHash({ datasetId: manifest.datasetId, version, contentHash: manifest.contentHash }) as ContentHash
        return { datasetId: manifest.datasetId, version, registrationHash, registeredAt: ctx.requestedAt }
      }
      const stored: DatasetManifest = { ...manifest }
      const version = 'v1'
      const idempotencyKey = `${manifest.datasetId}:${version}`
      await manifestRepo.save(stored, { idempotencyKey })
      await versionRepo.save(
        { datasetId: manifest.datasetId, version, contentHash: manifest.contentHash, createdAt: ctx.requestedAt },
        { idempotencyKey },
      )
      const registrationHash = canonicalMlHash({ datasetId: manifest.datasetId, version, contentHash: manifest.contentHash }) as ContentHash
      return { datasetId: manifest.datasetId, version, registrationHash, registeredAt: ctx.requestedAt }
    },
  }
}

// ── Task 6: Consent, Classification, Residency, Authorized Use ────────────────

export type DatasetClassificationLevel = 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED'

export interface DatasetClassificationRecord {
  readonly datasetId:           DatasetId
  readonly classificationLevel: DatasetClassificationLevel
  readonly piiPresent:          boolean
  readonly restrictedPurposes:  readonly string[]
  readonly classifiedAt:        DatasetIsoTimestamp
}

export interface DatasetResidencyRecord {
  readonly datasetId:        DatasetId
  readonly allowedRegions:   readonly string[]
  readonly prohibitedRegions: readonly string[]
  readonly recordedAt:       DatasetIsoTimestamp
}

export interface DatasetRetentionRecord {
  readonly datasetId:   DatasetId
  readonly retainUntil: DatasetIsoTimestamp
  readonly legalHold:   boolean
  readonly recordedAt:  DatasetIsoTimestamp
}

export interface DatasetConsentRecord {
  readonly datasetId:       DatasetId
  readonly consentScope:    string
  readonly grantedBy:       string
  readonly allowedPurposes: readonly string[]
  readonly grantedAt:       DatasetIsoTimestamp
  readonly revokedAt?:      DatasetIsoTimestamp
}

export interface DatasetUseAuthorizationRequest {
  readonly requestId:             string
  readonly datasetId:             DatasetId
  readonly purpose:               string
  readonly scope:                 string
  readonly requestedAt:           DatasetIsoTimestamp
  readonly requestingPrincipalId: string
  readonly tenantId:              string
  readonly environmentId:         string
}

export interface DatasetUseAuthorizationDecision {
  readonly decisionId:            string
  readonly requestId:             string
  readonly datasetId:             DatasetId
  readonly outcome:               DatasetAuthorizationOutcome
  readonly appliedPolicyIds:      readonly string[]
  readonly decidedAt:             DatasetIsoTimestamp
  readonly decisionHash:          ContentHash
  readonly conditionIds?:         readonly string[]
  readonly denialReasonCode?:     DatasetGovernanceErrorCode
  readonly supersedesDecisionId?: string
}

export interface DatasetUseAuthorizationService {
  authorize(req: DatasetUseAuthorizationRequest): Promise<DatasetUseAuthorizationDecision>
  validateRecord(rec: DatasetAuthorizationRecord): void
  supersedeDecision(decisionId: string, reason: string): Promise<DatasetUseAuthorizationDecision>
}

export function validateAuthorizationRecord(rec: DatasetAuthorizationRecord): void {
  if (!rec.authorizationId) {
    throw new Error('authorizationId must be non-empty')
  }
  if (!rec.policyReferenceIds || rec.policyReferenceIds.length === 0) {
    throw new Error('Authorization record must reference at least one policy')
  }
  if (rec.outcome === 'CONDITIONALLY_AUTHORIZED') {
    if (!rec.conditionIds || rec.conditionIds.length === 0) {
      throw new Error('CONDITIONALLY_AUTHORIZED record must carry conditionIds')
    }
  }
}

export function checkAuthorizationExpiry(
  rec: DatasetAuthorizationRecord,
  requestedAt: DatasetIsoTimestamp,
): boolean {
  if (!rec.expiresAt) return false
  return rec.expiresAt <= requestedAt
}

export function checkAuthorizationRevocation(rec: DatasetAuthorizationRecord): boolean {
  return rec.outcome === 'REVOKED'
}

export function purposeMatches(purpose: string, rec: DatasetAuthorizationRecord): boolean {
  return rec.purpose === purpose
}

export function scopeMatches(scope: string, rec: DatasetAuthorizationRecord): boolean {
  return rec.scope === scope
}
