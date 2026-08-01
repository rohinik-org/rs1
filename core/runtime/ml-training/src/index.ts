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

export interface TrainingAdmissionRepository {
  save(decision: unknown, opts?: RepositoryWriteOptions): Promise<RepositoryWriteResult>
  findById(id: string): Promise<unknown>
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
