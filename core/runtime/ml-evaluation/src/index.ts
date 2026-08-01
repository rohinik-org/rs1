// @rohinik-org/ml-evaluation — ports, error taxonomy, and provider contracts (Task 1)
// No framework/cloud ML SDK dependencies. No deployment/inference symbols. No Stage 11F reimplementation.

export type {
  EvaluationId, PromotionDecisionId, ContentHash, IsoTimestamp,
  ModelId, ExperimentId, TrainingRunId,
  ArtifactReference, EvidenceReference, JsonValue, ProviderExtension,
} from '@rohinik-org/ml-ir'
export { canonicalMlHash } from '@rohinik-org/ml-ir'
import { canonicalMlHash } from '@rohinik-org/ml-ir'
import type { IsoTimestamp, ContentHash } from '@rohinik-org/ml-ir'
export type { CandidateModelArtifact, CandidateArtifactLifecycleState } from '@rohinik-org/ml-training'

// ── Context ───────────────────────────────────────────────────────────────────

export interface EvaluationGovernanceContext {
  readonly tenantId:              string
  readonly environmentId:         string
  readonly requestedAt:           IsoTimestamp
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

export const EVALUATION_GOVERNANCE_ERROR_CODES = [
  'EVALUATION_MISSING_REQUEST',
  'EVALUATION_INVALID_IDENTITY',
  'EVALUATION_CANDIDATE_NOT_CANDIDATE_STATE',
  'EVALUATION_CANDIDATE_HASH_MISMATCH',
  'EVALUATION_SUITE_MISSING',
  'EVALUATION_SUITE_HASH_MISMATCH',
  'EVALUATION_DATASET_NOT_ADMITTED',
  'EVALUATION_MISSING_BASELINE',
  'EVALUATION_SELF_BASELINE_REJECTED',
  'EVALUATION_EXCEPTION_DENIED',
  'EVALUATION_MISSING_GOVERNANCE_EVIDENCE',
  'EVALUATION_HARD_SAFETY_FAILURE',
  'EVALUATION_SELF_EVIDENCE_SOLE_AUTHORITY',
  'EVALUATION_METRIC_MISSING',
  'EVALUATION_METRIC_NON_FINITE',
  'EVALUATION_METRIC_UNIT_INCOMPATIBLE',
  'EVALUATION_METRIC_REGRESSION',
  'EVALUATION_TERMINAL_RUN',
  'EVALUATION_INVALID_TRANSITION',
  'EVALUATION_RUN_CONFLICT',
  'EVALUATION_PROVIDER_VIOLATION',
  'EVALUATION_EVIDENCE_FAILURE',
  'EVALUATION_NO_PROMOTION_AUTHORITY',
  'EVALUATION_NO_DEPLOYMENT_AUTHORITY',
  'EVALUATION_DECISION_CONFLICT',
  'EVALUATION_DECISION_IMMUTABLE',
  'EVALUATION_REVIEW_IMMUTABLE',
  'EVALUATION_SUPERSESSION_CONFLICT',
  'EVALUATION_REEVALUATION_UNCHANGED',
  'EVALUATION_ENVIRONMENT_INELIGIBLE',
  'EVALUATION_PERSISTENCE_FAILURE',
] as const

export type EvaluationGovernanceErrorCode = typeof EVALUATION_GOVERNANCE_ERROR_CODES[number]

export interface EvaluationGovernanceError {
  readonly code:    EvaluationGovernanceErrorCode
  readonly message: string
  readonly detail?: string
}

export function makeEvaluationGovernanceError(
  code: EvaluationGovernanceErrorCode,
  message: string,
  detail?: string,
): EvaluationGovernanceError & Error {
  const err = new Error(`${code}: ${message}`) as Error & EvaluationGovernanceError
  ;(err as unknown as Record<string, unknown>)['code'] = code
  ;(err as unknown as Record<string, unknown>)['detail'] = detail
  return err as EvaluationGovernanceError & Error
}

// ── Injected primitives ───────────────────────────────────────────────────────

export interface Clock {
  now(): IsoTimestamp
}

export interface IdGenerator {
  generate(): string
}

export interface Hasher {
  hash(input: string): ContentHash
}

// ── Provider boundary (Stage 11F adapter) ─────────────────────────────────────

export interface EvaluationProviderMetricValue {
  readonly metricId:    string
  readonly value:       number
  readonly unit?:       string
}

export interface EvaluationProviderRequest {
  readonly runRef:      string
  readonly suiteId:     string
  readonly suiteVersion: string
  readonly datasetRef:  string
  readonly providerExtension?: Readonly<Record<string, unknown>>
}

export interface EvaluationProviderSubmitResult {
  readonly submitted: boolean
  readonly detail?:   string
}

export interface EvaluationProviderResponse {
  readonly runRef:      string
  readonly outcome:     'PASSED' | 'FAILED' | 'INCONCLUSIVE' | 'CANCELLED'
  readonly metricValues: readonly EvaluationProviderMetricValue[]
  readonly failureCode?:   string
  readonly failureDetail?: string
}

export interface EvaluationProviderAdapter {
  readonly adapterId: string
  // May submit and retrieve Stage 11F evaluation results only.
  // Cannot promote, deploy, alter candidates, define policy, fabricate baselines, or self-authorize.
  submit(request: EvaluationProviderRequest): Promise<EvaluationProviderSubmitResult>
  retrieveResult(runRef: string): Promise<EvaluationProviderResponse>
}

// ── Repository ports (unknown-typed stubs — replaced by later tasks) ──────────
// ponytail: unknown stubs; typed versions added per task as concrete types are defined

export interface EvaluationRequestRepository {
  save(record: unknown, opts?: RepositoryWriteOptions): Promise<RepositoryWriteResult>
  findById(id: string): Promise<unknown>
}

export interface EvaluationRunRepository {
  save(record: unknown, opts?: RepositoryWriteOptions): Promise<RepositoryWriteResult>
  findById(id: string): Promise<unknown>
}

export interface NormalizedResultRepository {
  save(record: unknown, opts?: RepositoryWriteOptions): Promise<RepositoryWriteResult>
  findById(id: string): Promise<unknown>
}

export interface BaselineRepository {
  save(record: unknown, opts?: RepositoryWriteOptions): Promise<RepositoryWriteResult>
  findById(id: string): Promise<unknown>
}

export interface PromotionDecisionRepository {
  save(record: unknown, opts?: RepositoryWriteOptions): Promise<RepositoryWriteResult>
  findById(id: string): Promise<unknown>
}

export interface ReviewRepository {
  save(record: unknown, opts?: RepositoryWriteOptions): Promise<RepositoryWriteResult>
  findById(id: string): Promise<unknown>
}

export interface SupersessionRepository {
  save(record: unknown, opts?: RepositoryWriteOptions): Promise<RepositoryWriteResult>
  findById(id: string): Promise<unknown>
}

// ── ModelEvaluationGovernanceService ─────────────────────────────────────────

export interface EvaluationGovernanceServiceRepos {
  readonly evaluationRequests:  EvaluationRequestRepository
  readonly evaluationRuns:      EvaluationRunRepository
  readonly normalizedResults:   NormalizedResultRepository
  readonly baselines:           BaselineRepository
  readonly promotionDecisions:  PromotionDecisionRepository
  readonly reviews:             ReviewRepository
  readonly supersessions:       SupersessionRepository
}

export interface ModelEvaluationGovernanceServiceInterface {
  // Expanded by Tasks 2–9; Task 1 establishes the shell only
}

export function ModelEvaluationGovernanceService(
  _deps: { repos: EvaluationGovernanceServiceRepos },
): ModelEvaluationGovernanceServiceInterface {
  return {}
}
