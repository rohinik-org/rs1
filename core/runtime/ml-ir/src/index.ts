// ── JSON-safe primitives (Task 1) ─────────────────────────────────────────────

export type JsonPrimitive = string | number | boolean | null

export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue }

export function isJsonPrimitive(value: unknown): value is JsonPrimitive {
  if (value === null) return true
  const t = typeof value
  return t === 'string' || t === 'number' || t === 'boolean'
}

export function isJsonValue(value: unknown): value is JsonValue {
  if (value === null) return true
  if (isJsonPrimitive(value)) return true
  if (Array.isArray(value)) {
    if (value.length !== Object.keys(value).length) return false // sparse
    return value.every(isJsonValue)
  }
  if (typeof value !== 'object') return false
  const proto = Object.getPrototypeOf(value) as unknown
  if (proto !== Object.prototype && proto !== null) return false
  return Object.values(value as Record<string, unknown>).every(isJsonValue)
}

// ── Branded types (Task 2) ─────────────────────────────────────────────────────

declare const _brand: unique symbol
type Brand<T, B> = T & { readonly [_brand]: B }

export type ModelId            = Brand<string, 'ModelId'>
export type DatasetId          = Brand<string, 'DatasetId'>
export type PartitionId        = Brand<string, 'PartitionId'>
export type FeatureSchemaId    = Brand<string, 'FeatureSchemaId'>
export type ExperimentId       = Brand<string, 'ExperimentId'>
export type TrainingRunId      = Brand<string, 'TrainingRunId'>
export type CheckpointId       = Brand<string, 'CheckpointId'>
export type EvaluationId       = Brand<string, 'EvaluationId'>
export type PromotionDecisionId = Brand<string, 'PromotionDecisionId'>
export type DeploymentId       = Brand<string, 'DeploymentId'>
export type EndpointId         = Brand<string, 'EndpointId'>
export type InferenceRequestId = Brand<string, 'InferenceRequestId'>
export type DriftSignalId      = Brand<string, 'DriftSignalId'>
export type RollbackDirectiveId = Brand<string, 'RollbackDirectiveId'>
export type RetirementRecordId = Brand<string, 'RetirementRecordId'>

export type IsoTimestamp = Brand<string, 'IsoTimestamp'>
export type ContentHash  = Brand<string, 'ContentHash'>

// ── Validators ─────────────────────────────────────────────────────────────────

function requireNonEmpty(value: string, label: string): void {
  if (!value || !value.trim()) throw new Error(`${label} must be a non-empty string`)
}

const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/
const CONTENT_HASH_RE = /^sha256:[0-9a-f]{64}$/

// ── Constructors ───────────────────────────────────────────────────────────────

export function modelId(v: string):            ModelId            { requireNonEmpty(v, 'ModelId');            return v as ModelId }
export function datasetId(v: string):          DatasetId          { requireNonEmpty(v, 'DatasetId');          return v as DatasetId }
export function partitionId(v: string):        PartitionId        { requireNonEmpty(v, 'PartitionId');        return v as PartitionId }
export function featureSchemaId(v: string):    FeatureSchemaId    { requireNonEmpty(v, 'FeatureSchemaId');    return v as FeatureSchemaId }
export function experimentId(v: string):       ExperimentId       { requireNonEmpty(v, 'ExperimentId');       return v as ExperimentId }
export function trainingRunId(v: string):      TrainingRunId      { requireNonEmpty(v, 'TrainingRunId');      return v as TrainingRunId }
export function checkpointId(v: string):       CheckpointId       { requireNonEmpty(v, 'CheckpointId');       return v as CheckpointId }
export function evaluationId(v: string):       EvaluationId       { requireNonEmpty(v, 'EvaluationId');       return v as EvaluationId }
export function promotionDecisionId(v: string): PromotionDecisionId { requireNonEmpty(v, 'PromotionDecisionId'); return v as PromotionDecisionId }
export function deploymentId(v: string):       DeploymentId       { requireNonEmpty(v, 'DeploymentId');       return v as DeploymentId }
export function endpointId(v: string):         EndpointId         { requireNonEmpty(v, 'EndpointId');         return v as EndpointId }
export function inferenceRequestId(v: string): InferenceRequestId { requireNonEmpty(v, 'InferenceRequestId'); return v as InferenceRequestId }
export function driftSignalId(v: string):      DriftSignalId      { requireNonEmpty(v, 'DriftSignalId');      return v as DriftSignalId }
export function rollbackDirectiveId(v: string): RollbackDirectiveId { requireNonEmpty(v, 'RollbackDirectiveId'); return v as RollbackDirectiveId }
export function retirementRecordId(v: string): RetirementRecordId { requireNonEmpty(v, 'RetirementRecordId'); return v as RetirementRecordId }

export function isoTimestamp(v: string): IsoTimestamp {
  requireNonEmpty(v, 'IsoTimestamp')
  if (!ISO_UTC_RE.test(v)) throw new Error(`IsoTimestamp must be UTC ISO-8601, got: ${v}`)
  return v as IsoTimestamp
}

export function contentHash(v: string): ContentHash {
  requireNonEmpty(v, 'ContentHash')
  if (!CONTENT_HASH_RE.test(v)) throw new Error(`ContentHash must be sha256:<64 lowercase hex>, got: ${v}`)
  return v as ContentHash
}

// ── Reference interfaces ───────────────────────────────────────────────────────

export interface SchemaReference {
  readonly kind:       'schema'
  readonly schemaId:   string
  readonly schemaHash: string
}

export interface ArtifactReference {
  readonly kind:         'artifact'
  readonly artifactId:   string
  readonly artifactHash: string
}

export interface ArtifactLocation {
  readonly uri: string
}

export interface ProviderReference {
  readonly kind:       'provider'
  readonly providerId: string
}

export interface PolicyDecisionReference {
  readonly kind:         'policy-decision'
  readonly policyId:     string
  readonly decisionHash: string
}

export interface EvidenceReference {
  readonly kind:         'evidence'
  readonly evidenceId:   string
  readonly evidenceHash: string
}

// ── ProviderExtension ──────────────────────────────────────────────────────────
// Non-authoritative. Cannot override canonical ML IR fields.

export interface ProviderExtension {
  readonly providerName: string
  readonly metadata:     Record<string, JsonValue>
}

// ── Canonical serialization (Task 3) ──────────────────────────────────────────

import { createHash } from 'node:crypto'

export const ML_CANONICALIZATION_VERSION = '1' as const

export interface CanonicalMlEnvelope<T> {
  readonly $contractType:            string
  readonly $schemaVersion:           string
  readonly $canonicalizationVersion: typeof ML_CANONICALIZATION_VERSION
  readonly payload:                  T
}

// ponytail: logic mirrors core/runtime/lockfile/src/canonicalizer.ts; not imported to avoid cross-package dep
function mlNormalize(value: unknown, seen: Set<object>): unknown {
  if (value === null) return null
  if (value === undefined) throw new TypeError('canonicalMlJson: undefined is not allowed')
  const t = typeof value
  if (t === 'string' || t === 'boolean') return value
  if (t === 'number') {
    if (!isFinite(value as number) || Object.is(value, -0)) {
      throw new TypeError(`canonicalMlJson: non-finite or negative-zero number: ${value}`)
    }
    return value
  }
  if (t !== 'object') throw new TypeError(`canonicalMlJson: unsupported type '${t}'`)
  const obj = value as object
  if (seen.has(obj)) throw new TypeError('canonicalMlJson: cyclic structure detected')
  seen.add(obj)
  try {
    if (Array.isArray(obj)) {
      const arr = obj as unknown[]
      // sparse array: length !== number of own enumerable indices
      if (arr.length !== Object.keys(arr).length) throw new TypeError('canonicalMlJson: sparse array is not allowed')
      return arr.map(v => mlNormalize(v, seen))
    }
    const proto = Object.getPrototypeOf(obj)
    if (proto !== Object.prototype && proto !== null) {
      const name = (obj as { constructor?: { name?: string } }).constructor?.name ?? 'unknown'
      throw new TypeError(`canonicalMlJson: non-plain object is not serializable: ${name}`)
    }
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, mlNormalize(v, seen)])
    )
  } finally {
    seen.delete(obj)
  }
}

export function canonicalMlJson(value: unknown): string {
  return JSON.stringify(mlNormalize(value, new Set()))
}

export function canonicalMlHash(value: unknown): string {
  const json = canonicalMlJson(value)
  const hex = createHash('sha256').update(json).digest('hex')
  return `sha256:${hex}`
}
