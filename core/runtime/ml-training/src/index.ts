// @rohinik-org/ml-training — ports, error taxonomy, and provider contracts (Task 1)
// No framework/cloud ML SDK dependencies. No Stage 12D–12F symbols.

export type {
  ExperimentId, TrainingRunId, CheckpointId, ContentHash, IsoTimestamp,
  ModelId, DatasetId, PartitionId, FeatureSchemaId,
  ArtifactReference, ArtifactLocation, ProviderReference, EvidenceReference,
  JsonValue, ProviderExtension,
} from '@rohinik-org/ml-ir'
export { canonicalMlHash } from '@rohinik-org/ml-ir'
import { canonicalMlHash } from '@rohinik-org/ml-ir'
import type { IsoTimestamp, TrainingRunId, ContentHash, ExperimentId, CheckpointId, DatasetId, PartitionId, FeatureSchemaId } from '@rohinik-org/ml-ir'
import type {
  DatasetAdmissionDecision, DatasetAdmissionOutcome,
  GovernedDatasetVersion, GovernedPartition,
  FeatureSchemaCompatibilityOutcome, DatasetAuthorizationRecord, DatasetAuthorizationOutcome,
} from '@rohinik-org/ml-dataset'

export type { DatasetAdmissionDecision, DatasetAdmissionOutcome, DatasetAuthorizationOutcome } from '@rohinik-org/ml-dataset'

// ── TrainingIsoTimestamp ──────────────────────────────────────────────────────

export type TrainingIsoTimestamp = IsoTimestamp

// ── Context ───────────────────────────────────────────────────────────────────

export interface TrainingGovernanceContext {
  readonly tenantId:              string
  readonly environmentId:         string
  readonly requestedAt:           TrainingIsoTimestamp
  readonly requestingPrincipalId: string
}

// ── Repository primitives ─────────────────────────────────────────────────────

export interface RepositoryWriteResult {
  readonly stored:   boolean
  readonly conflict: boolean
}

export interface RepositoryWriteOptions {
  readonly idempotencyKey?: string
}

// ── Error taxonomy ────────────────────────────────────────────────────────────

export const TRAINING_GOVERNANCE_ERROR_CODES = [
  'TRAINING_MISSING_ADMISSION',
  'TRAINING_INVALID_IDENTITY',
  'TRAINING_DATASET_NOT_ADMITTED',
  'TRAINING_DATASET_VERSION_CONFLICT',
  'TRAINING_PARTITION_MISSING',
  'TRAINING_PARTITION_INVALID_PURPOSE',
  'TRAINING_SCHEMA_INCOMPATIBLE',
  'TRAINING_AUTHORIZATION_DENIED',
  'TRAINING_POLICY_DENIED',
  'TRAINING_TERMINAL_RUN',
  'TRAINING_INVALID_TRANSITION',
  'TRAINING_CHECKPOINT_CONFLICT',
  'TRAINING_CHECKPOINT_CORRUPT',
  'TRAINING_CHECKPOINT_SEQUENCE_ERROR',
  'TRAINING_NO_PROMOTION_AUTHORITY',
  'TRAINING_NO_DEPLOYMENT_AUTHORITY',
  'TRAINING_PROVIDER_VIOLATION',
  'TRAINING_EVIDENCE_FAILURE',
  'TRAINING_REPRODUCIBILITY_UNDISCLOSED',
  'TRAINING_SEED_POLICY_INVALID',
  'TRAINING_ENVIRONMENT_MUTABLE_TAG',
  'TRAINING_EXPERIMENT_CLOSED',
  'TRAINING_CANDIDATE_HASH_MISMATCH',
] as const

export type TrainingGovernanceErrorCode = typeof TRAINING_GOVERNANCE_ERROR_CODES[number]

export interface TrainingGovernanceError {
  readonly code:    TrainingGovernanceErrorCode
  readonly message: string
  readonly detail?: string
}

export function makeTrainingGovernanceError(
  code: TrainingGovernanceErrorCode,
  message: string,
  detail?: string,
): TrainingGovernanceError & Error {
  const err = new Error(`${code}: ${message}`) as Error & TrainingGovernanceError
  ;(err as unknown as Record<string, unknown>)['code'] = code
  ;(err as unknown as Record<string, unknown>)['detail'] = detail
  return err as TrainingGovernanceError & Error
}

// ── Provider contracts ────────────────────────────────────────────────────────

export interface TrainingProviderRequest {
  readonly runId:            TrainingRunId
  readonly experimentId:     ExperimentId
  readonly hyperparameters:  Readonly<Record<string, unknown>>
  readonly datasetRefs:      readonly { datasetId: string; version: string; partitionIds: readonly string[] }[]
  readonly environmentHash:  ContentHash
  readonly seedPolicy:       TrainingSeedPolicy
  readonly checkpointRef?:   { checkpointId: CheckpointId; artifactHash: ContentHash }
  readonly providerExtension?: Readonly<Record<string, unknown>>
}

export interface TrainingProviderPrepareResult {
  readonly prepared: boolean
  readonly detail?:  string
}

export interface TrainingProviderArtifactRef {
  readonly uri:         string
  readonly contentHash: ContentHash
}

export interface TrainingProviderResponse {
  readonly runId:             TrainingRunId
  readonly outcome:           'SUCCEEDED' | 'FAILED' | 'CANCELLED'
  readonly outputArtifactRef?: TrainingProviderArtifactRef
  readonly failureCode?:      string
  readonly failureDetail?:    string
}

export interface TrainingProvider {
  readonly providerId: string
  prepare(request: TrainingProviderRequest): Promise<TrainingProviderPrepareResult>
  start(request: TrainingProviderRequest): Promise<void>
  cancel(runId: TrainingRunId): Promise<void>
  reportOutcome(runId: TrainingRunId): Promise<TrainingProviderResponse>
  restoreFromCheckpoint?(runId: TrainingRunId, checkpointId: CheckpointId): Promise<void>
}

// ── Seed policy ───────────────────────────────────────────────────────────────

export type TrainingSeedMode = 'FIXED' | 'RANDOM' | 'NONDETERMINISTIC'

export interface TrainingSeedPolicy {
  readonly mode:          TrainingSeedMode
  readonly fixedSeed?:    number
  readonly justification?: string
}

// ── Repository ports ──────────────────────────────────────────────────────────

export interface ExperimentRepository {
  save(experiment: unknown, opts?: RepositoryWriteOptions): Promise<RepositoryWriteResult>
  findById(id: ExperimentId): Promise<unknown>
}

export interface TrainingRunRepository {
  save(run: unknown, opts?: RepositoryWriteOptions): Promise<RepositoryWriteResult>
  findById(id: TrainingRunId): Promise<unknown>
}

export interface CheckpointRepository {
  save(checkpoint: unknown, opts?: RepositoryWriteOptions): Promise<RepositoryWriteResult>
  findById(id: CheckpointId): Promise<unknown>
  findByRunId(runId: TrainingRunId): Promise<readonly unknown[]>
}

export interface TrainingObservationRepository {
  save(observation: unknown, opts?: RepositoryWriteOptions): Promise<RepositoryWriteResult>
  findByRunId(runId: TrainingRunId): Promise<readonly unknown[]>
}

export interface CandidateArtifactRepository {
  save(artifact: unknown, opts?: RepositoryWriteOptions): Promise<RepositoryWriteResult>
  findById(id: string): Promise<unknown>
}

export interface ReproducibilityRecordRepository {
  save(record: unknown, opts?: RepositoryWriteOptions): Promise<RepositoryWriteResult>
  findByRunId(runId: TrainingRunId): Promise<unknown>
}


// ── Top-level service port ────────────────────────────────────────────────────

export interface TrainingGovernanceService {
  registerExperiment(input: unknown, ctx: TrainingGovernanceContext): Promise<unknown>
  submitRun(input: unknown, ctx: TrainingGovernanceContext): Promise<unknown>
  admitRun(runId: TrainingRunId, ctx: TrainingGovernanceContext): Promise<unknown>
  executeRun(runId: TrainingRunId, ctx: TrainingGovernanceContext): Promise<unknown>
  cancelRun(runId: TrainingRunId, ctx: TrainingGovernanceContext): Promise<unknown>
  getRunStatus(runId: TrainingRunId): Promise<unknown>
}

// ── Task 2: Experiment Registry and Training Submission Contracts ─────────────

export type ExperimentLifecycleState = 'OPEN' | 'CLOSED'

export type ObjectiveDirection = 'MAXIMIZE' | 'MINIMIZE'

export interface ExperimentObjective {
  readonly metric:    string
  readonly direction: ObjectiveDirection
}

export interface GovernedExperiment {
  readonly experimentId:   ExperimentId
  readonly name:           string
  readonly objective:      ExperimentObjective
  readonly state:          ExperimentLifecycleState
  readonly registeredAt:   TrainingIsoTimestamp
  readonly registeredBy:   string
  readonly registrationHash: string
}

export interface ExperimentRegistrationInput {
  readonly experimentId:   ExperimentId
  readonly name:           string
  readonly objective:      ExperimentObjective
  readonly registeredAt:   TrainingIsoTimestamp
  readonly registeredBy:   string
}

export interface ExperimentRegistrationResult {
  readonly inserted:   boolean
  readonly idempotent: boolean
  readonly conflict:   boolean
  readonly experiment: GovernedExperiment
}

export function validateExperimentRegistration(input: ExperimentRegistrationInput): void {
  if (!input.experimentId) throw makeTrainingGovernanceError('TRAINING_INVALID_IDENTITY', 'experimentId must be non-empty')
  if (!input.name) throw makeTrainingGovernanceError('TRAINING_INVALID_IDENTITY', 'name must be non-empty')
  if (!input.objective.metric) throw makeTrainingGovernanceError('TRAINING_INVALID_IDENTITY', 'objective.metric must be non-empty')
}

export function registerExperiment(
  input: ExperimentRegistrationInput,
  store: Map<string, GovernedExperiment>,
): ExperimentRegistrationResult {
  validateExperimentRegistration(input)
  const registrationHash = canonicalMlHash({ experimentId: input.experimentId, name: input.name, objective: input.objective })
  const existing = store.get(input.experimentId)
  if (existing) {
    if (existing.registrationHash === registrationHash) return { inserted: false, idempotent: true, conflict: false, experiment: existing }
    return { inserted: false, idempotent: false, conflict: true, experiment: existing }
  }
  const experiment: GovernedExperiment = {
    experimentId: input.experimentId, name: input.name,
    objective: input.objective, state: 'OPEN',
    registeredAt: input.registeredAt, registeredBy: input.registeredBy,
    registrationHash,
  }
  store.set(input.experimentId, experiment)
  return { inserted: true, idempotent: false, conflict: false, experiment }
}

export interface DatasetBinding {
  readonly datasetId:     DatasetId
  readonly version:       string
  readonly partitionIds:  readonly PartitionId[]
}

export interface TrainingSubmission {
  readonly submissionId:     string
  readonly experimentId:     ExperimentId
  readonly runId:            TrainingRunId
  readonly datasetBindings:  readonly DatasetBinding[]
  readonly featureSchemaId:  FeatureSchemaId
  readonly featureSchemaVersion: string
  readonly hyperparameters:  Readonly<Record<string, unknown>>
  readonly seedPolicy:       TrainingSeedPolicy
  readonly submittedAt:      TrainingIsoTimestamp
  readonly submittedBy:      string
  readonly submissionHash:   string
  readonly baselineRunId?:   TrainingRunId
}

export interface TrainingSubmissionInput {
  readonly submissionId:     string
  readonly experimentId:     ExperimentId
  readonly runId:            TrainingRunId
  readonly datasetBindings:  readonly DatasetBinding[]
  readonly featureSchemaId:  FeatureSchemaId
  readonly featureSchemaVersion: string
  readonly hyperparameters:  Readonly<Record<string, unknown>>
  readonly seedPolicy:       TrainingSeedPolicy
  readonly submittedAt:      TrainingIsoTimestamp
  readonly submittedBy:      string
  readonly baselineRunId?:   TrainingRunId
}

export function computeSubmissionHash(sub: Omit<TrainingSubmission, 'submissionHash'> & Partial<Pick<TrainingSubmission, 'submissionHash'>>): string {
  return canonicalMlHash({
    submissionId: sub.submissionId, experimentId: sub.experimentId, runId: sub.runId,
    datasetBindings: sub.datasetBindings, featureSchemaId: sub.featureSchemaId,
    featureSchemaVersion: sub.featureSchemaVersion, hyperparameters: sub.hyperparameters,
    seedPolicy: sub.seedPolicy,
  })
}

export function buildTrainingSubmission(
  input: TrainingSubmissionInput,
  experiments: Map<string, GovernedExperiment>,
): TrainingSubmission {
  const exp = experiments.get(input.experimentId)
  if (!exp) throw makeTrainingGovernanceError('TRAINING_MISSING_ADMISSION', `unknown experimentId: ${input.experimentId}`)
  if (exp.state === 'CLOSED') throw makeTrainingGovernanceError('TRAINING_EXPERIMENT_CLOSED', `experiment ${input.experimentId} is CLOSED`)
  if (input.datasetBindings.length === 0) throw makeTrainingGovernanceError('TRAINING_DATASET_NOT_ADMITTED', 'datasetBindings must be non-empty')
  if (Object.keys(input.hyperparameters).length === 0) throw makeTrainingGovernanceError('TRAINING_INVALID_IDENTITY', 'hyperparameters must have at least one key')
  const submissionHash = computeSubmissionHash(input)
  return { ...input, submissionHash }
}

// ── Task 3: Training Admission and Dataset Binding ────────────────────────────

export type TrainingAdmissionOutcome = 'ADMITTED' | 'RESTRICTED' | 'REJECTED'

export type TrainingAdmissionReason =
  | 'INVALID_IDENTITY'
  | 'DATASET_NOT_ADMITTED'
  | 'DATASET_DELETED_OR_RESTRICTED'
  | 'PARTITION_MISSING'
  | 'PARTITION_INVALID_PURPOSE'
  | 'SCHEMA_INCOMPATIBLE'
  | 'AUTHORIZATION_DENIED'
  | 'POLICY_DENIED'
  | 'CONDITIONAL_AUTHORIZATION'
  | 'MANUAL_REVIEW'
  | 'ALL_CHECKS_PASSED'

export interface TrainingAdmissionRequest {
  readonly admissionId:           string
  readonly runId:                 TrainingRunId
  readonly submissionId:          string
  readonly requestedAt:           TrainingIsoTimestamp
  readonly requestingPrincipalId: string
  readonly tenantId:              string
  readonly environmentId:         string
  readonly datasetBindings:       readonly { datasetId: DatasetId; version: string; partitionIds: readonly PartitionId[] }[]
  readonly featureSchemaId:       FeatureSchemaId
  readonly featureSchemaVersion:  string
}

export type PolicyDecision = 'APPROVED' | 'DENIED' | 'MANUAL_REVIEW'

export interface TrainingAdmissionInputs {
  readonly datasetVersions:       Readonly<Record<string, GovernedDatasetVersion>>
  readonly datasetAdmissions:     Readonly<Record<string, DatasetAdmissionDecision>>
  readonly partitions:            readonly GovernedPartition[]
  readonly datasetAuthorizations: Readonly<Record<string, DatasetAuthorizationRecord>>
  readonly schemaCompatibility:   FeatureSchemaCompatibilityOutcome
  readonly policyDecision?:       PolicyDecision
}

export interface TrainingAdmissionDecision {
  readonly admissionId:   string
  readonly runId:         TrainingRunId
  readonly submissionId:  string
  readonly outcome:       TrainingAdmissionOutcome
  readonly reason:        TrainingAdmissionReason
  readonly decidedAt:     TrainingIsoTimestamp
  readonly admissionHash: ContentHash
}

export interface TrainingAdmissionRepository {
  save(decision: TrainingAdmissionDecision, opts?: RepositoryWriteOptions): Promise<RepositoryWriteResult>
  findById(id: string): Promise<TrainingAdmissionDecision | undefined>
}

const VALID_TRAINING_PARTITION_PURPOSES = new Set(['TRAIN', 'VALIDATION', 'TEST', 'CALIBRATION', 'CUSTOM'])
const AUTH_DENIED_OUTCOMES = new Set<DatasetAuthorizationOutcome>(['DENIED', 'EXPIRED', 'REVOKED'])

export interface TrainingAdmissionServiceInterface {
  admit(req: TrainingAdmissionRequest, inputs: TrainingAdmissionInputs): Promise<TrainingAdmissionDecision>
}

export function TrainingAdmissionService(deps: {
  repo: TrainingAdmissionRepository
}): TrainingAdmissionServiceInterface {
  return {
    async admit(req, inputs) {
      let outcome: TrainingAdmissionOutcome = 'ADMITTED'
      let reason: TrainingAdmissionReason = 'ALL_CHECKS_PASSED'

      // Step 1: identity — binding versions must match provided dataset versions
      const identityMismatch = req.datasetBindings.some(b => {
        const v = inputs.datasetVersions[b.datasetId]
        return !v || v.version !== b.version
      })
      if (identityMismatch) {
        outcome = 'REJECTED'; reason = 'INVALID_IDENTITY'
      }

      // Step 2: dataset admission decision must exist and be ADMITTED
      else if (req.datasetBindings.some(b => {
        const adm = inputs.datasetAdmissions[b.datasetId]
        return !adm || adm.outcome !== 'ADMITTED'
      })) {
        outcome = 'REJECTED'; reason = 'DATASET_NOT_ADMITTED'
      }

      // Step 3: dataset version must not be deleted or restricted
      else if (req.datasetBindings.some(b => {
        const v = inputs.datasetVersions[b.datasetId]
        return v?.state === 'DELETED' || v?.state === 'RESTRICTED'
      })) {
        outcome = 'REJECTED'; reason = 'DATASET_DELETED_OR_RESTRICTED'
      }

      // Step 4: all referenced partition IDs must be present
      else {
        const partitionMap = new Map(inputs.partitions.map(p => [p.partitionId, p]))
        const missingPartition = req.datasetBindings.some(b =>
          b.partitionIds.some(pid => !partitionMap.has(pid))
        )
        if (missingPartition) {
          outcome = 'REJECTED'; reason = 'PARTITION_MISSING'
        }

        // Step 5: partition purpose must be valid for training
        else if (req.datasetBindings.some(b =>
          b.partitionIds.some(pid => {
            const p = partitionMap.get(pid)
            return p && !VALID_TRAINING_PARTITION_PURPOSES.has(p.purpose)
          })
        )) {
          outcome = 'REJECTED'; reason = 'PARTITION_INVALID_PURPOSE'
        }

        // Step 6: schema must be compatible
        else if (inputs.schemaCompatibility === 'INCOMPATIBLE') {
          outcome = 'REJECTED'; reason = 'SCHEMA_INCOMPATIBLE'
        }

        // Step 7: dataset authorization must not be denied
        else if (req.datasetBindings.some(b => {
          const auth = inputs.datasetAuthorizations[b.datasetId]
          return auth && AUTH_DENIED_OUTCOMES.has(auth.outcome)
        })) {
          outcome = 'REJECTED'; reason = 'AUTHORIZATION_DENIED'
        }

        // Step 8: policy decision
        else if (inputs.policyDecision === 'DENIED') {
          outcome = 'REJECTED'; reason = 'POLICY_DENIED'
        }

        // Step 9: conditional/manual review → RESTRICTED
        else if (req.datasetBindings.some(b => {
          const auth = inputs.datasetAuthorizations[b.datasetId]
          return auth?.outcome === 'CONDITIONALLY_AUTHORIZED'
        })) {
          outcome = 'RESTRICTED'; reason = 'CONDITIONAL_AUTHORIZATION'
        }

        else if (req.datasetBindings.some(b => {
          const auth = inputs.datasetAuthorizations[b.datasetId]
          return auth?.outcome === 'MANUAL_REVIEW_REQUIRED'
        })) {
          outcome = 'RESTRICTED'; reason = 'MANUAL_REVIEW'
        }

        else if (inputs.policyDecision === 'MANUAL_REVIEW') {
          outcome = 'RESTRICTED'; reason = 'MANUAL_REVIEW'
        }
        // Step 10: fall-through = ADMITTED / ALL_CHECKS_PASSED
      }

      const admissionHash = canonicalMlHash({
        admissionId: req.admissionId, runId: req.runId, submissionId: req.submissionId,
        outcome, reason, decidedAt: req.requestedAt,
      }) as ContentHash

      const decision: TrainingAdmissionDecision = {
        admissionId: req.admissionId,
        runId: req.runId,
        submissionId: req.submissionId,
        outcome,
        reason,
        decidedAt: req.requestedAt,
        admissionHash,
      }

      await deps.repo.save(decision, { idempotencyKey: req.admissionId })
      return decision
    },
  }
}

// ── Task 4: Environment, Dependency, Hyperparameter, and Seed Governance ──────

export interface TrainingEnvironmentInput {
  readonly imageRef:        string
  readonly imageHash:       ContentHash
  readonly runtimeVersion:  string
  readonly dependencyHash:  ContentHash
  readonly hardwareProfile: string
  readonly environmentHash?: ContentHash
}

export interface TrainingEnvironmentResult {
  readonly imageRef:        string
  readonly imageHash:       ContentHash
  readonly runtimeVersion:  string
  readonly dependencyHash:  ContentHash
  readonly hardwareProfile: string
  readonly environmentHash: ContentHash
}

export function validateTrainingEnvironment(input: TrainingEnvironmentInput): TrainingEnvironmentResult {
  // digest pin required: imageRef must contain @sha256:
  if (!input.imageRef.includes('@sha256:') && !input.imageRef.includes('@sha')) {
    throw makeTrainingGovernanceError('TRAINING_ENVIRONMENT_MUTABLE_TAG', `imageRef must be digest-pinned, got: ${input.imageRef}`)
  }
  if (!input.imageHash) throw makeTrainingGovernanceError('TRAINING_INVALID_IDENTITY', 'imageHash must be non-empty')
  if (!input.dependencyHash) throw makeTrainingGovernanceError('TRAINING_INVALID_IDENTITY', 'dependencyHash must be non-empty')
  if (!input.runtimeVersion) throw makeTrainingGovernanceError('TRAINING_INVALID_IDENTITY', 'runtimeVersion must be non-empty')
  const environmentHash = canonicalMlHash({
    imageRef: input.imageRef, imageHash: input.imageHash,
    runtimeVersion: input.runtimeVersion, dependencyHash: input.dependencyHash,
    hardwareProfile: input.hardwareProfile,
  }) as ContentHash
  return {
    imageRef: input.imageRef, imageHash: input.imageHash,
    runtimeVersion: input.runtimeVersion, dependencyHash: input.dependencyHash,
    hardwareProfile: input.hardwareProfile, environmentHash,
  }
}

export interface HyperparameterSchema {
  readonly allowedKeys: readonly string[]
  readonly required:    readonly string[]
}

export interface HyperparameterCanonicalResult {
  readonly canonical: Readonly<Record<string, unknown>>
  readonly paramHash: ContentHash
}

export function canonicalizeHyperparameters(
  params: Readonly<Record<string, unknown>>,
  schema?: HyperparameterSchema,
): HyperparameterCanonicalResult {
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) throw makeTrainingGovernanceError('TRAINING_INVALID_IDENTITY', `hyperparameter "${k}" has null/undefined value`)
    if (typeof v === 'number' && !Number.isFinite(v)) throw makeTrainingGovernanceError('TRAINING_INVALID_IDENTITY', `hyperparameter "${k}" is not finite: ${v}`)
  }
  if (schema) {
    for (const k of Object.keys(params)) {
      if (!schema.allowedKeys.includes(k)) throw makeTrainingGovernanceError('TRAINING_INVALID_IDENTITY', `unknown hyperparameter "${k}"`)
    }
    for (const k of schema.required) {
      if (!(k in params)) throw makeTrainingGovernanceError('TRAINING_INVALID_IDENTITY', `required hyperparameter "${k}" missing`)
    }
  }
  const paramHash = canonicalMlHash(params) as ContentHash
  return { canonical: params, paramHash }
}

export function validateSeedPolicy(policy: TrainingSeedPolicy): void {
  if (policy.mode === 'FIXED' && policy.fixedSeed === undefined) {
    throw makeTrainingGovernanceError('TRAINING_SEED_POLICY_INVALID', 'FIXED seed mode requires fixedSeed number')
  }
  if (policy.mode === 'NONDETERMINISTIC' && !policy.justification) {
    throw makeTrainingGovernanceError('TRAINING_SEED_POLICY_INVALID', 'NONDETERMINISTIC mode requires justification')
  }
}

export type ReproducibilityLevel = 'LIKELY_REPRODUCIBLE' | 'NOT_GUARANTEED'

export interface ReproducibilityAssessment {
  readonly level:           ReproducibilityLevel
  readonly seedMode:        TrainingSeedMode
  readonly disclosureHash:  ContentHash
}

export function assessReproducibility(
  seedPolicy: TrainingSeedPolicy,
  env: TrainingEnvironmentResult,
): ReproducibilityAssessment {
  // ponytail: FIXED seed + pinned env = LIKELY; anything else = NOT_GUARANTEED.
  // EXACT is intentionally excluded — hardware nondeterminism means no strong guarantee.
  const level: ReproducibilityLevel =
    seedPolicy.mode === 'FIXED' ? 'LIKELY_REPRODUCIBLE' : 'NOT_GUARANTEED'
  const disclosureHash = canonicalMlHash({
    level, seedMode: seedPolicy.mode,
    fixedSeed: seedPolicy.fixedSeed,
    environmentHash: env.environmentHash,
  }) as ContentHash
  return { level, seedMode: seedPolicy.mode, disclosureHash }
}
