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

// ── Model contracts (Task 4) ───────────────────────────────────────────────────

export type ModelKind =
  | 'classifier' | 'regressor' | 'embedding' | 'generative'
  | 'ranker' | 'anomaly-detector' | 'custom'

export type ModelArtifactFormat =
  | 'onnx' | 'pytorch' | 'tensorflow-savedmodel'
  | 'sklearn-pickle' | 'xgboost' | 'custom'

export type ModelLifecycleState = 'draft' | 'staging' | 'active' | 'deprecated' | 'retired'

const MODEL_LIFECYCLE_STATES = new Set<string>(['draft', 'staging', 'active', 'deprecated', 'retired'])
export function isValidModelLifecycleState(s: string): s is ModelLifecycleState {
  return MODEL_LIFECYCLE_STATES.has(s)
}

export interface ModelArtifact {
  readonly artifactId:   string
  readonly format:       ModelArtifactFormat
  readonly contentHash:  ContentHash
  readonly sizeBytes:    number
  readonly locations:    ArtifactLocation[]
}

export interface ModelManifest {
  readonly modelId:    ModelId
  readonly name:       string
  readonly kind:       ModelKind
  readonly artifact:   ModelArtifact
  readonly createdAt:  IsoTimestamp
  readonly provider?:  ProviderExtension
}

export interface ModelVersion {
  readonly modelId:        ModelId
  readonly version:        string
  readonly manifestHash:   ContentHash
  readonly lifecycleState: ModelLifecycleState
  readonly createdAt:      IsoTimestamp
}

export interface ModelProvenance {
  readonly modelId:             ModelId
  readonly trainingDatasetIds:  DatasetId[]
  readonly featureSchemaIds:    FeatureSchemaId[]
  readonly createdAt:           IsoTimestamp
}

export interface ModelSupersession {
  readonly modelId:             ModelId
  readonly supersededAt:        IsoTimestamp
  readonly supersededByModelId: ModelId
  readonly reason:              string
}

// ── Dataset contracts (Task 4) ─────────────────────────────────────────────────

export type DatasetLifecycleState = 'active' | 'deprecated' | 'deleted'

const DATASET_LIFECYCLE_STATES = new Set<string>(['active', 'deprecated', 'deleted'])
export function isValidDatasetLifecycleState(s: string): s is DatasetLifecycleState {
  return DATASET_LIFECYCLE_STATES.has(s)
}

export interface DatasetManifest {
  readonly datasetId:      DatasetId
  readonly name:           string
  readonly contentHash:    ContentHash
  readonly recordCount:    number
  readonly createdAt:      IsoTimestamp
  readonly lifecycleState: DatasetLifecycleState
  readonly provider?:      ProviderExtension
}

export interface DatasetVersion {
  readonly datasetId:   DatasetId
  readonly version:     string
  readonly contentHash: ContentHash
  readonly createdAt:   IsoTimestamp
}

export interface DatasetPartition {
  readonly partitionId:  PartitionId
  readonly datasetId:    DatasetId
  readonly role:         string
  readonly contentHash:  ContentHash
  readonly recordCount:  number
}

export interface DatasetProvenance {
  readonly datasetId:              DatasetId
  readonly sourceDescription:      string
  readonly authorizedUsePolicyIds: string[]
  readonly createdAt:              IsoTimestamp
}

export interface DatasetSupersession {
  readonly datasetId:              DatasetId
  readonly supersededAt:           IsoTimestamp
  readonly supersededByDatasetId:  DatasetId
  readonly reason:                 string
}

export interface DeletionImpact {
  readonly datasetId:        DatasetId
  readonly impactedModelIds: ModelId[]
}

// ── Feature contracts (Task 4) ─────────────────────────────────────────────────

export interface FeatureDefinition {
  readonly name:         string
  readonly dtype:        string
  readonly nullable?:    boolean
  readonly description?: string
}

export interface TargetDefinition {
  readonly name:         string
  readonly dtype:        string
  readonly description?: string
}

export interface FeatureSchema {
  readonly featureSchemaId: FeatureSchemaId
  readonly name:            string
  readonly features:        FeatureDefinition[]
  readonly targets:         TargetDefinition[]
  readonly contentHash:     ContentHash
  readonly createdAt:       IsoTimestamp
}

export interface TransformationLineage {
  readonly transformationId:          string
  readonly implementationId:          string
  readonly inputDatasetIds:           DatasetId[]
  readonly outputDatasetId:           DatasetId
  readonly parentTransformationIds:   string[]
  readonly parameterHash:             ContentHash
  readonly appliedAt:                 IsoTimestamp
}

// ── Experiment and training contracts (Task 5) ────────────────────────────────

export interface ExperimentObjective {
  readonly metric:    string
  readonly direction: 'minimize' | 'maximize'
}

export interface ExperimentRecord {
  readonly experimentId: ExperimentId
  readonly name:         string
  readonly objectives:   ExperimentObjective[]
  readonly createdAt:    IsoTimestamp
  readonly description?: string
}

export type TrainingRunState =
  | 'DRAFT' | 'ADMISSION_PENDING' | 'ADMITTED' | 'QUEUED'
  | 'RUNNING' | 'CHECKPOINTING'
  | 'SUCCEEDED' | 'FAILED' | 'CANCELLED'

export const TRAINING_RUN_TERMINAL_STATES = new Set<TrainingRunState>(['SUCCEEDED', 'FAILED', 'CANCELLED'])

// Valid forward edges in the state machine.
const VALID_TRANSITIONS = new Map<TrainingRunState, TrainingRunState[]>([
  ['DRAFT',             ['ADMISSION_PENDING']],
  ['ADMISSION_PENDING', ['ADMITTED', 'FAILED']],
  ['ADMITTED',          ['QUEUED']],
  ['QUEUED',            ['RUNNING', 'CANCELLED']],
  ['RUNNING',           ['CHECKPOINTING', 'SUCCEEDED', 'FAILED', 'CANCELLED']],
  ['CHECKPOINTING',     ['RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED']],
])

export function isValidTrainingRunTransition(from: TrainingRunState, to: TrainingRunState): boolean {
  return VALID_TRANSITIONS.get(from)?.includes(to) ?? false
}

export interface PartitionBinding {
  readonly partitionId: PartitionId
  readonly role:        string
}

export interface TrainingEnvironment {
  readonly runtimeId:        string
  readonly frameworkVersion: string
  readonly hardwareClass:    string
}

export interface HyperparameterSet {
  readonly values:        Record<string, JsonValue>
  readonly parameterHash: ContentHash
}

export type SeedPolicy =
  | { readonly kind: 'fixed'; readonly seed: number }
  | { readonly kind: 'nondeterministic'; readonly justification: string }

export type ReproducibilityLevel = 'exact' | 'best-effort' | 'non-reproducible'

export interface ReproducibilityRecord {
  readonly trainingRunId:              TrainingRunId
  readonly level:                      ReproducibilityLevel
  readonly sourceHash:                 ContentHash
  readonly environmentHash:            ContentHash
  readonly dataHash:                   ContentHash
  readonly parameterHash:              ContentHash
  readonly seedPolicy:                 SeedPolicy
  readonly nonReproducibleJustification?: string
}

export interface TrainingRun {
  readonly trainingRunId:       TrainingRunId
  readonly experimentId:        ExperimentId
  readonly state:               TrainingRunState
  readonly modelId:             ModelId
  readonly trainingDatasetId:   DatasetId
  readonly partitionBindings:   PartitionBinding[]
  readonly featureSchemaId:     FeatureSchemaId
  readonly environment:         TrainingEnvironment
  readonly hyperparameters:     HyperparameterSet
  readonly createdAt:           IsoTimestamp
  readonly candidateArtifactHash?: ContentHash
  readonly resumedFromCheckpointId?: CheckpointId
  readonly resumedFromRunId?:   TrainingRunId
}

export interface CheckpointManifest {
  readonly checkpointId:   CheckpointId
  readonly trainingRunId:  TrainingRunId
  readonly sequenceNumber: number
  readonly contentHash:    ContentHash
  readonly savedAt:        IsoTimestamp
  readonly epoch?:         number
}

export interface SubmitTrainingRunRequest {
  readonly trainingRunId:      TrainingRunId
  readonly experimentId:       ExperimentId
  readonly modelId:            ModelId
  readonly trainingDatasetId:  DatasetId
  readonly partitionBindings:  PartitionBinding[]
  readonly featureSchemaId:    FeatureSchemaId
  readonly environment:        TrainingEnvironment
  readonly hyperparameters:    HyperparameterSet
  readonly requestedAt:        IsoTimestamp
  readonly seedPolicy?:        SeedPolicy
}

export interface CancelTrainingRunRequest {
  readonly trainingRunId: TrainingRunId
  readonly reason:        string
  readonly requestedAt:   IsoTimestamp
}

export interface ResumeTrainingRunRequest {
  readonly originalTrainingRunId: TrainingRunId
  readonly fromCheckpointId:      CheckpointId
  readonly newTrainingRunId:      TrainingRunId
  readonly requestedAt:           IsoTimestamp
}

// ── Task 6: Evaluation, Baseline, Promotion, and Supersession ─────────────────

export type ModelEvaluationState = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED'

export type DeploymentEnvironmentClass = 'STAGING' | 'PRODUCTION' | 'SHADOW' | 'CANARY'

export type PromotionReason = 'PASSED_EVALUATION' | 'BASELINE_EXCEPTION' | 'MANUAL_APPROVAL'

export type PromotionOutcome = 'APPROVED' | 'REJECTED' | 'REQUIRES_REVIEW'

export interface EvaluationSuiteReference {
  readonly suiteId:   string
  readonly suiteHash: string
}

export interface EvaluationBaselineReference {
  readonly baselineModelId:       ModelId
  readonly baselineEvaluationId:  EvaluationId
}

export interface EvaluationDatasetBinding {
  readonly datasetId:  DatasetId
  readonly splitName:  string
  readonly rowCount:   number
}

export interface MetricResult {
  readonly name:          string
  readonly value:         number
  readonly unit?:         string
  readonly higherIsBetter: boolean
}

export interface ModelEvaluationRequest {
  readonly evaluationId:     EvaluationId
  readonly modelId:          ModelId
  readonly trainingRunId:    TrainingRunId
  readonly datasetBinding:   EvaluationDatasetBinding
  readonly suiteReference:   EvaluationSuiteReference
  readonly requestedAt:      IsoTimestamp
  readonly baselineReference?: EvaluationBaselineReference
}

export interface ModelEvaluationResult {
  readonly evaluationId:      EvaluationId
  readonly state:             ModelEvaluationState
  readonly modelId:           ModelId
  readonly trainingRunId:     TrainingRunId
  readonly datasetBinding:    EvaluationDatasetBinding
  readonly suiteReference:    EvaluationSuiteReference
  readonly baselineReference?: EvaluationBaselineReference
  readonly metrics:           readonly MetricResult[]
  readonly evidenceReference?: EvidenceReference
  readonly completedAt?:      IsoTimestamp
  readonly resultHash?:       ContentHash
}

export interface PromotionRequest {
  readonly promotionDecisionId:   PromotionDecisionId
  readonly modelId:               ModelId
  readonly trainingRunId:         TrainingRunId
  readonly evaluationId:          EvaluationId
  readonly evaluationResultHash:  ContentHash
  readonly targetEnvironment:     DeploymentEnvironmentClass
  readonly reason:                PromotionReason
  readonly requestedAt:           IsoTimestamp
}

export interface PromotionDecision {
  readonly promotionDecisionId: PromotionDecisionId
  readonly modelId:             ModelId
  readonly trainingRunId:       TrainingRunId
  readonly evaluationId:        EvaluationId
  readonly targetEnvironment:   DeploymentEnvironmentClass
  readonly outcome:             PromotionOutcome
  readonly reason:              PromotionReason
  readonly decidedAt:           IsoTimestamp
  readonly decisionHash:        ContentHash
  readonly supersedesDecisionId?: PromotionDecisionId
}

export function validateEvaluationResult(result: ModelEvaluationResult): void {
  if (result.state !== 'COMPLETED') {
    throw new Error(`Evaluation result state must be COMPLETED, got: ${result.state}`)
  }
  if (!result.metrics || result.metrics.length === 0) {
    throw new Error('Evaluation result must have at least one metric')
  }
  if (!result.evidenceReference) {
    throw new Error('Evaluation result must carry an evidenceReference (LAW-070)')
  }
  if (!result.baselineReference) {
    throw new Error('Evaluation result must carry a baselineReference (LAW-068)')
  }
}

export function validatePromotionRequest(req: PromotionRequest, evalResult: ModelEvaluationResult): void {
  if (!req.evaluationId) {
    throw new Error('Promotion requires an evaluationId (LAW-067: training does not promote)')
  }
  if (evalResult.state !== 'COMPLETED') {
    throw new Error(`Promotion requires COMPLETED evaluation, got: ${evalResult.state} (LAW-068)`)
  }
  if (evalResult.modelId !== req.modelId) {
    throw new Error('Promotion modelId must match evaluation modelId (LAW-068)')
  }
  if (!evalResult.resultHash || evalResult.resultHash !== req.evaluationResultHash) {
    throw new Error('evaluationResultHash must match evaluation resultHash (LAW-068)')
  }
}

// ── Deployment, endpoint, inference, and rollback contracts (Task 7) ──────────

export type DeploymentState = 'PENDING' | 'ROLLING_OUT' | 'ACTIVE' | 'ROLLING_BACK' | 'FAILED' | 'RETIRED'
export type EndpointState   = 'PROVISIONING' | 'READY' | 'DRAINING' | 'TERMINATED' | 'FAILED'
export type InferenceOutcome = 'SUCCESS' | 'ERROR' | 'FILTERED' | 'TIMEOUT'

const DEPLOYMENT_TRANSITIONS = new Map<DeploymentState, DeploymentState[]>([
  ['PENDING',       ['ROLLING_OUT']],
  ['ROLLING_OUT',   ['ACTIVE', 'FAILED']],
  ['ACTIVE',        ['ROLLING_BACK', 'RETIRED']],
  ['ROLLING_BACK',  ['ACTIVE', 'FAILED']],
])

export function isValidDeploymentTransition(from: DeploymentState, to: DeploymentState): boolean {
  return DEPLOYMENT_TRANSITIONS.get(from)?.includes(to) ?? false
}

const ENDPOINT_TRANSITIONS = new Map<EndpointState, EndpointState[]>([
  ['PROVISIONING', ['READY', 'FAILED']],
  ['READY',        ['DRAINING', 'FAILED']],
  ['DRAINING',     ['TERMINATED']],
])

export function isValidEndpointTransition(from: EndpointState, to: EndpointState): boolean {
  return ENDPOINT_TRANSITIONS.get(from)?.includes(to) ?? false
}

export function isValidTrafficAllocation(steps: TrafficAllocationStep[]): boolean {
  if (steps.some(s => s.trafficPercent < 0)) return false
  const total = steps.reduce((s, t) => s + t.trafficPercent, 0)
  return total === 0 || total === 100
}

export interface TrafficAllocationStep {
  readonly revisionId:      string
  readonly trafficPercent:  number
}

export interface RolloutPlan {
  readonly deploymentId: DeploymentId
  readonly steps:        TrafficAllocationStep[]
  readonly createdAt:    IsoTimestamp
}

export interface DeploymentRevision {
  readonly revisionId:         string
  readonly deploymentId:       DeploymentId
  readonly modelArtifactHash:  ContentHash
  readonly createdAt:          IsoTimestamp
}

export interface ModelDeployment {
  readonly deploymentId:        DeploymentId
  readonly modelId:             ModelId
  readonly promotionDecisionId: PromotionDecisionId
  readonly environment:         string
  readonly state:               DeploymentState
  readonly currentRevisionId:   string
  readonly createdAt:           IsoTimestamp
  readonly provider?:           ProviderExtension
}

export interface InferenceEndpoint {
  readonly endpointId:    EndpointId
  readonly deploymentId:  DeploymentId
  readonly state:         EndpointState
  readonly uri:           string
  readonly createdAt:     IsoTimestamp
  readonly provider?:     ProviderExtension
}

export interface InferenceRequest {
  readonly inferenceRequestId: InferenceRequestId
  readonly endpointId:         EndpointId
  readonly inputHash:          ContentHash
  readonly requestedAt:        IsoTimestamp
}

export interface InferenceResult {
  readonly inferenceRequestId: InferenceRequestId
  readonly endpointId:         EndpointId
  readonly outcome:            InferenceOutcome
  readonly outputHash:         ContentHash
  readonly evidenceHash:       ContentHash
  readonly latencyMs:          number
  readonly respondedAt:        IsoTimestamp
}

export interface RollbackDirective {
  readonly rollbackDirectiveId: RollbackDirectiveId
  readonly deploymentId:        DeploymentId
  readonly fromRevisionId:      string
  readonly toRevisionId:        string
  readonly authorizationToken:  string
  readonly reason:              string
  readonly issuedAt:            IsoTimestamp
}

export interface DeployModelRequest {
  readonly deploymentId:        DeploymentId
  readonly modelId:             ModelId
  readonly promotionDecisionId: PromotionDecisionId
  readonly environment:         string
  readonly revisionId:          string
  readonly modelArtifactHash:   ContentHash
  readonly requestedAt:         IsoTimestamp
}

export interface RollbackRequest {
  readonly deploymentId:       DeploymentId
  readonly toRevisionId:       string
  readonly authorizationToken: string
  readonly reason:             string
  readonly requestedAt:        IsoTimestamp
}
