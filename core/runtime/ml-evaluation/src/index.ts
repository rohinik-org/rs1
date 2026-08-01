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
  'EVALUATION_REVIEW_INVALID',
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

// ── Task 2: Evaluation Suite Binding and Candidate Evaluation Request ─────────

export interface EvaluationSuiteReference {
  readonly suiteId:      string
  readonly suiteVersion: string
  readonly suiteHash:    ContentHash
}

export type EvaluationDatasetAdmissionStatus = 'ADMITTED' | 'REJECTED' | 'DELETED' | 'RESTRICTED'

export interface EvaluationDatasetBinding {
  readonly datasetId:      string
  readonly datasetVersion: string
  readonly admissionStatus: EvaluationDatasetAdmissionStatus
}

export interface CandidateEvaluationRequest {
  readonly evaluationId:       string
  readonly candidate:          import('@rohinik-org/ml-training').CandidateModelArtifact
  readonly suite:               EvaluationSuiteReference
  readonly dataset:             EvaluationDatasetBinding
  readonly requestedAt:         IsoTimestamp
  readonly requestedBy:         string
  readonly requestHash:         ContentHash
  readonly providerExtension?:  Readonly<Record<string, unknown>>
  // promotionOutcome is never present on a request — only on a decision
  readonly promotionOutcome?:   undefined
}

export interface CandidateEvaluationRequestInput {
  readonly evaluationId:       string
  readonly candidate:          import('@rohinik-org/ml-training').CandidateModelArtifact
  readonly suite:               EvaluationSuiteReference
  readonly dataset:             EvaluationDatasetBinding
  readonly requestedAt:         IsoTimestamp
  readonly requestedBy:         string
  readonly providerExtension?:  Readonly<Record<string, unknown>>
}

const HASH_RE = /^sha256:[0-9a-f]{64}$/

export function buildEvaluationRequest(input: CandidateEvaluationRequestInput): CandidateEvaluationRequest {
  if (!input.evaluationId?.trim()) throw makeEvaluationGovernanceError('EVALUATION_INVALID_IDENTITY', 'evaluationId must be non-empty')
  if (!input.requestedBy?.trim()) throw makeEvaluationGovernanceError('EVALUATION_INVALID_IDENTITY', 'requestedBy must be non-empty')
  if (input.candidate.lifecycleState !== 'CANDIDATE') throw makeEvaluationGovernanceError('EVALUATION_CANDIDATE_NOT_CANDIDATE_STATE', `candidate lifecycleState must be CANDIDATE, got ${input.candidate.lifecycleState}`)
  if (!input.suite.suiteId?.trim()) throw makeEvaluationGovernanceError('EVALUATION_SUITE_MISSING', 'suite.suiteId must be non-empty')
  if (!HASH_RE.test(input.suite.suiteHash)) throw makeEvaluationGovernanceError('EVALUATION_SUITE_HASH_MISMATCH', 'suite.suiteHash must be sha256:<64 hex chars>')
  if (input.dataset.admissionStatus !== 'ADMITTED') throw makeEvaluationGovernanceError('EVALUATION_DATASET_NOT_ADMITTED', `dataset admissionStatus is ${input.dataset.admissionStatus}`)

  const requestHash = canonicalMlHash({
    evaluationId: input.evaluationId,
    candidateArtifactId: input.candidate.artifactId,
    candidateCanonicalHash: input.candidate.canonicalHash,
    suiteId: input.suite.suiteId,
    suiteVersion: input.suite.suiteVersion,
    suiteHash: input.suite.suiteHash,
    datasetId: input.dataset.datasetId,
    datasetVersion: input.dataset.datasetVersion,
    requestedBy: input.requestedBy,
  })

  const base: CandidateEvaluationRequest = {
    evaluationId: input.evaluationId,
    candidate: input.candidate,
    suite: input.suite,
    dataset: input.dataset,
    requestedAt: input.requestedAt,
    requestedBy: input.requestedBy,
    requestHash: requestHash as ContentHash,
  }
  return input.providerExtension ? { ...base, providerExtension: input.providerExtension } : base
}

export interface EvaluationRequestRegistrationResult {
  readonly request:    CandidateEvaluationRequest
  readonly idempotent: boolean
  readonly conflict:   boolean
}

export interface CandidateEvaluationRequestBuilderInterface {
  register(input: CandidateEvaluationRequestInput): EvaluationRequestRegistrationResult
}

export function CandidateEvaluationRequestBuilder(
  deps: { store: Map<string, CandidateEvaluationRequest> },
): CandidateEvaluationRequestBuilderInterface {
  return {
    register(input) {
      const req = buildEvaluationRequest(input)
      const existing = deps.store.get(input.evaluationId)
      if (existing) {
        if (existing.requestHash === req.requestHash) return { request: existing, idempotent: true, conflict: false }
        return { request: existing, idempotent: false, conflict: true }
      }
      deps.store.set(input.evaluationId, req)
      return { request: req, idempotent: false, conflict: false }
    },
  }
}

// ── Task 3: Baseline Registry, Comparison Policy, and Exception Governance ────

export type BaselineKind = 'current-production' | 'approved-reference' | 'previous-version' | 'deterministic-reference'

export interface BaselineRecord {
  readonly baselineId:     string
  readonly kind:           BaselineKind
  readonly modelVersionId: string
  readonly evidenceRef:    { readonly evidenceId: string; readonly evidenceHash: ContentHash }
  readonly registeredAt:   IsoTimestamp
  readonly registeredBy:   string
  readonly baselineHash:   ContentHash
  supersededBy?:           string
  supersededAt?:           IsoTimestamp
}

export interface BaselineRegistrationInput {
  readonly baselineId:     string
  readonly kind:           BaselineKind
  readonly modelVersionId: string
  readonly evidenceRef:    { readonly evidenceId: string; readonly evidenceHash: ContentHash }
  readonly registeredAt:   IsoTimestamp
  readonly registeredBy:   string
}

export function registerBaseline(
  input: BaselineRegistrationInput,
  store: Map<string, BaselineRecord>,
  candidateVersionId?: string,
): BaselineRecord {
  if (!input.evidenceRef.evidenceId?.trim() || !input.evidenceRef.evidenceHash?.trim()) {
    throw makeEvaluationGovernanceError('EVALUATION_MISSING_BASELINE', 'baseline must have non-empty evidenceId and evidenceHash')
  }
  if (candidateVersionId && input.modelVersionId === candidateVersionId) {
    throw makeEvaluationGovernanceError('EVALUATION_SELF_BASELINE_REJECTED', 'candidate cannot be its own baseline')
  }

  const baselineHash = canonicalMlHash({
    baselineId: input.baselineId,
    kind: input.kind,
    modelVersionId: input.modelVersionId,
    evidenceId: input.evidenceRef.evidenceId,
    evidenceHash: input.evidenceRef.evidenceHash,
  }) as ContentHash

  const existing = store.get(input.baselineId)
  if (existing) {
    if (existing.baselineHash === baselineHash) return existing
    throw makeEvaluationGovernanceError('EVALUATION_MISSING_BASELINE', `baseline conflict: id ${input.baselineId} already registered with different content`)
  }

  const record: BaselineRecord = { ...input, baselineHash }
  store.set(input.baselineId, record)
  return record
}

export type MetricDirection = 'HIGHER_IS_BETTER' | 'LOWER_IS_BETTER' | 'TARGET_RANGE'

export interface ComparisonPolicy {
  readonly policyId:                    string
  readonly metricId:                    string
  readonly direction:                   MetricDirection
  readonly minimumImprovementAbsolute:  number
  readonly nonRegressionThreshold:      number
  readonly targetRangeMin?:             number
  readonly targetRangeMax?:             number
}

export type ExceptionOutcome = 'APPROVED' | 'DENIED'

export interface BaselineExceptionRequest {
  readonly exceptionId:   string
  readonly reason:        string
  readonly requestedAt:   IsoTimestamp
  readonly requestedBy:   string
}

export interface BaselineExceptionDecision {
  readonly exceptionId: string
  readonly outcome:     ExceptionOutcome
  readonly decidedAt:   IsoTimestamp
  readonly authority:   string
}

export interface BaselineRegistryServiceInterface {
  validatePolicy(policy: ComparisonPolicy): void
  decideException(req: BaselineExceptionRequest, outcome: ExceptionOutcome, authority: string): BaselineExceptionDecision
  supersede(baselineId: string, supersededById: string, at: IsoTimestamp, by: string): void
  getSupersessionChain(baselineId: string): readonly BaselineRecord[]
}

export function BaselineRegistryService(
  deps: { store: Map<string, BaselineRecord> },
): BaselineRegistryServiceInterface {
  return {
    validatePolicy(policy) {
      if ((policy.direction === 'HIGHER_IS_BETTER' || policy.direction === 'LOWER_IS_BETTER') && policy.minimumImprovementAbsolute < 0) {
        throw makeEvaluationGovernanceError('EVALUATION_MISSING_BASELINE', `minimumImprovementAbsolute must be >= 0 for direction ${policy.direction}`)
      }
    },

    decideException(req, outcome, authority) {
      if (!req.reason?.trim()) throw makeEvaluationGovernanceError('EVALUATION_EXCEPTION_DENIED', 'exception reason must be non-empty')
      return { exceptionId: req.exceptionId, outcome, decidedAt: req.requestedAt, authority }
    },

    supersede(baselineId, supersededById, at, _by) {
      const record = deps.store.get(baselineId)
      if (!record) throw makeEvaluationGovernanceError('EVALUATION_MISSING_BASELINE', `baseline ${baselineId} not found`)
      const updated: BaselineRecord = { ...record, supersededBy: supersededById, supersededAt: at }
      deps.store.set(baselineId, updated)
    },

    getSupersessionChain(baselineId) {
      const chain: BaselineRecord[] = []
      let current = deps.store.get(baselineId)
      while (current) {
        chain.push(current)
        current = current.supersededBy ? deps.store.get(current.supersededBy) : undefined
      }
      return chain
    },
  }
}
