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

// ── Task 6: Safety, Robustness, Fairness, and Review Evidence ────────────────

type EvidenceOutcome = 'PASS' | 'FAIL' | 'CONDITIONAL'

interface EvidenceRefBase {
  readonly evidenceId:   string
  readonly policyId:     string
  readonly evidenceHash: ContentHash
  readonly outcome:      EvidenceOutcome
  readonly recordedAt:   IsoTimestamp
  readonly authority:    string
}

export interface SafetyEvidenceRef        extends EvidenceRefBase { readonly _kind?: 'safety' }
export interface RobustnessEvidenceRef    extends EvidenceRefBase { readonly _kind?: 'robustness' }
export interface FairnessEvidenceRef      extends EvidenceRefBase { readonly _kind?: 'fairness' }
export interface PrivacyEvidenceRef       extends EvidenceRefBase { readonly _kind?: 'privacy' }
export interface ExplainabilityEvidenceRef extends EvidenceRefBase { readonly _kind?: 'explainability' }
export interface ProhibitedUseEvidenceRef extends EvidenceRefBase { readonly _kind?: 'prohibitedUse' }
export interface AdversarialTestEvidenceRef extends EvidenceRefBase { readonly _kind?: 'adversarialTest' }

export interface GovernanceEvidenceBundle {
  readonly candidateArtifactId: string
  readonly safety?:             SafetyEvidenceRef
  readonly robustness?:         RobustnessEvidenceRef
  readonly fairness?:           FairnessEvidenceRef
  readonly privacy?:            PrivacyEvidenceRef
  readonly explainability?:     ExplainabilityEvidenceRef
  readonly prohibitedUse?:      ProhibitedUseEvidenceRef
  readonly adversarialTest?:    AdversarialTestEvidenceRef
}

export interface GovernanceEvidenceValidationResult {
  readonly eligible:               boolean
  readonly evidenceBundleHash:     ContentHash
  readonly missingMandatory:       readonly string[]
  readonly hardFailures:           readonly string[]
  readonly selfEvidenceViolations: readonly string[]
}

export interface ManualReviewRecord {
  readonly reviewId:            string
  readonly artifactId:          string
  readonly reviewerPrincipalId: string
  readonly decision:            'APPROVED' | 'REJECTED' | 'CONDITIONAL'
  readonly rationale:           string
  readonly reviewedAt:          IsoTimestamp
  readonly reviewHash?:         ContentHash
}

export interface ManualReviewRecordResult {
  readonly inserted:    boolean
  readonly idempotent:  boolean
  readonly conflict:    boolean
  readonly review:      ManualReviewRecord
}

const MANDATORY_KEYS = ['safety', 'robustness', 'fairness', 'privacy'] as const
const HARD_FAILURE_KEYS = ['safety', 'privacy', 'fairness'] as const

export function validateGovernanceEvidence(
  bundle: GovernanceEvidenceBundle,
): GovernanceEvidenceValidationResult {
  const missingMandatory: string[] = []
  const hardFailures: string[] = []
  const selfEvidenceViolations: string[] = []

  for (const key of MANDATORY_KEYS) {
    if (!bundle[key]) { missingMandatory.push(key); continue }
    const ref = bundle[key] as EvidenceRefBase
    if (HARD_FAILURE_KEYS.includes(key as typeof HARD_FAILURE_KEYS[number]) && ref.outcome === 'FAIL') {
      hardFailures.push(key)
    }
    if (ref.authority === bundle.candidateArtifactId) {
      selfEvidenceViolations.push(key)
    }
  }

  const eligible = missingMandatory.length === 0 && hardFailures.length === 0 && selfEvidenceViolations.length === 0

  const evidenceBundleHash = canonicalMlHash({
    candidateArtifactId: bundle.candidateArtifactId,
    safety:       bundle.safety?.evidenceHash ?? null,
    robustness:   bundle.robustness?.evidenceHash ?? null,
    fairness:     bundle.fairness?.evidenceHash ?? null,
    privacy:      bundle.privacy?.evidenceHash ?? null,
    explainability: bundle.explainability?.evidenceHash ?? null,
    prohibitedUse: bundle.prohibitedUse?.evidenceHash ?? null,
    adversarialTest: bundle.adversarialTest?.evidenceHash ?? null,
  }) as ContentHash

  return { eligible, evidenceBundleHash, missingMandatory, hardFailures, selfEvidenceViolations }
}

export function recordManualReview(
  input: ManualReviewRecord,
  store: Map<string, ManualReviewRecord>,
): ManualReviewRecordResult {
  if (!input.rationale?.trim()) {
    throw makeEvaluationGovernanceError('EVALUATION_REVIEW_INVALID', 'review rationale must be non-empty')
  }

  const reviewHash = canonicalMlHash({
    reviewId: input.reviewId, artifactId: input.artifactId,
    reviewerPrincipalId: input.reviewerPrincipalId,
    decision: input.decision, reviewedAt: input.reviewedAt,
  }) as ContentHash

  const existing = store.get(input.reviewId)
  if (existing) {
    if (existing.reviewHash === reviewHash) return { inserted: false, idempotent: true, conflict: false, review: existing }
    return { inserted: false, idempotent: false, conflict: true, review: existing }
  }

  const review: ManualReviewRecord = { ...input, reviewHash }
  store.set(input.reviewId, review)
  return { inserted: true, idempotent: false, conflict: false, review }
}

// ── Task 4: Evaluation Run Lifecycle and Stage 11F Integration ────────────────

export type EvaluationRunLifecycleState =
  | 'DRAFT' | 'ADMITTED' | 'QUEUED' | 'RUNNING'
  | 'PASSED' | 'FAILED' | 'INCONCLUSIVE' | 'CANCELLED'

export type EvaluationRunTerminalOutcome = 'PASSED' | 'FAILED' | 'INCONCLUSIVE' | 'CANCELLED'

const TERMINAL_RUN_STATES = new Set<EvaluationRunLifecycleState>(['PASSED', 'FAILED', 'INCONCLUSIVE', 'CANCELLED'])

const VALID_RUN_TRANSITIONS: Record<EvaluationRunLifecycleState, readonly EvaluationRunLifecycleState[]> = {
  DRAFT:       ['ADMITTED'],
  ADMITTED:    ['QUEUED'],
  QUEUED:      ['RUNNING', 'CANCELLED'],
  RUNNING:     ['PASSED', 'FAILED', 'INCONCLUSIVE', 'CANCELLED'],
  PASSED:      [],
  FAILED:      [],
  INCONCLUSIVE:[],
  CANCELLED:   [],
}

export interface EvaluationRun {
  readonly runId:           string
  readonly evaluationId:    string
  readonly adapterId:       string
  readonly requestHash:     ContentHash
  readonly createdAt:       IsoTimestamp
  readonly state:           EvaluationRunLifecycleState
  readonly terminalOutcome?: EvaluationRunTerminalOutcome
  readonly providerRunRef?:  string
  readonly resultHash?:      ContentHash
  readonly failureCode?:     string
  readonly completedAt?:     IsoTimestamp
  // promotionDecision intentionally absent — no promotion authority here
}

export interface CreateEvaluationRunInput {
  readonly runId:        string
  readonly evaluationId: string
  readonly adapterId:    string
  readonly requestHash:  ContentHash
  readonly createdAt:    IsoTimestamp
}

export function createEvaluationRun(input: CreateEvaluationRunInput): EvaluationRun {
  if (!input.runId?.trim()) throw makeEvaluationGovernanceError('EVALUATION_INVALID_IDENTITY', 'runId must be non-empty')
  if (!input.evaluationId?.trim()) throw makeEvaluationGovernanceError('EVALUATION_INVALID_IDENTITY', 'evaluationId must be non-empty')
  return { ...input, state: 'DRAFT' }
}

export function transitionEvaluationRun(
  run: EvaluationRun,
  to: EvaluationRunLifecycleState,
  _at: IsoTimestamp,
): EvaluationRun {
  if (TERMINAL_RUN_STATES.has(run.state)) {
    throw makeEvaluationGovernanceError('EVALUATION_TERMINAL_RUN', `run ${run.runId} is terminal (${run.state}), cannot transition`)
  }
  if (!VALID_RUN_TRANSITIONS[run.state].includes(to)) {
    throw makeEvaluationGovernanceError('EVALUATION_INVALID_TRANSITION', `${run.state} → ${to} is not a valid evaluation run transition`)
  }
  return { ...run, state: to }
}

export interface EvaluationRunCompletionInput {
  readonly outcome:       EvaluationRunTerminalOutcome
  readonly completedAt:   IsoTimestamp
  readonly providerRunRef: string
  readonly failureCode?:  string
}

export function completeEvaluationRun(run: EvaluationRun, input: EvaluationRunCompletionInput): EvaluationRun {
  if (TERMINAL_RUN_STATES.has(run.state)) {
    throw makeEvaluationGovernanceError('EVALUATION_TERMINAL_RUN', `run ${run.runId} is already terminal (${run.state})`)
  }
  if (run.state !== 'RUNNING') {
    throw makeEvaluationGovernanceError('EVALUATION_INVALID_TRANSITION', `can only complete a RUNNING run, current state is ${run.state}`)
  }
  const resultHash = canonicalMlHash({
    runId: run.runId,
    evaluationId: run.evaluationId,
    outcome: input.outcome,
    providerRunRef: input.providerRunRef,
    completedAt: input.completedAt,
  }) as ContentHash
  return {
    ...run,
    state: input.outcome,
    terminalOutcome: input.outcome,
    providerRunRef: input.providerRunRef,
    resultHash,
    completedAt: input.completedAt,
    ...(input.failureCode ? { failureCode: input.failureCode } : {}),
  }
}

export function cancelEvaluationRun(run: EvaluationRun, at: IsoTimestamp, _reason: string): EvaluationRun {
  if (TERMINAL_RUN_STATES.has(run.state)) {
    throw makeEvaluationGovernanceError('EVALUATION_TERMINAL_RUN', `run ${run.runId} is terminal (${run.state}), cannot cancel`)
  }
  if (run.state !== 'RUNNING' && run.state !== 'QUEUED') {
    throw makeEvaluationGovernanceError('EVALUATION_INVALID_TRANSITION', `can only cancel RUNNING or QUEUED runs, current state is ${run.state}`)
  }
  const resultHash = canonicalMlHash({ runId: run.runId, outcome: 'CANCELLED', cancelledAt: at }) as ContentHash
  return { ...run, state: 'CANCELLED', terminalOutcome: 'CANCELLED', completedAt: at, resultHash }
}

// ── Task 5: Metric Normalization, Thresholds, and Comparative Results ─────────

// Unit compatibility: only these pairs are convertible
const UNIT_CONVERSIONS: Record<string, Record<string, (v: number) => number>> = {
  percent: { ratio: (v) => v / 100 },
  ratio:   { percent: (v) => v * 100 },
}

function convertUnit(value: number, from: string, to: string): number {
  if (from === to) return value
  const conv = UNIT_CONVERSIONS[from]?.[to]
  if (!conv) throw makeEvaluationGovernanceError('EVALUATION_METRIC_UNIT_INCOMPATIBLE', `cannot convert unit '${from}' to '${to}'`)
  return conv(value)
}

export interface MetricNormalizationInput {
  readonly metricId:       string
  readonly value:          number
  readonly unit?:          string
  readonly direction:      MetricDirection
  readonly threshold:      number
  readonly thresholdUnit?: string
  readonly targetRangeMax?: number
  readonly mandatory?:     boolean
  readonly confidence?:    number
}

export interface NormalizedMetric {
  readonly metricId:        string
  readonly value:           number
  readonly normalizedValue: number
  readonly pass:            boolean
  readonly missing:         boolean
  readonly confidence:      number
}

export function normalizeMetric(input: MetricNormalizationInput): NormalizedMetric {
  const mandatory = input.mandatory ?? true

  // missing check (null/undefined only — NaN is non-finite, not missing)
  if (input.value == null) {
    if (mandatory) throw makeEvaluationGovernanceError('EVALUATION_METRIC_MISSING', `mandatory metric '${input.metricId}' has no value`)
    return { metricId: input.metricId, value: input.value, normalizedValue: input.value, pass: false, missing: true, confidence: 1 }
  }

  if (!isFinite(input.value)) throw makeEvaluationGovernanceError('EVALUATION_METRIC_NON_FINITE', `metric '${input.metricId}' value is non-finite: ${input.value}`)

  const fromUnit = input.unit ?? 'ratio'
  const toUnit = input.thresholdUnit ?? fromUnit
  const normalizedValue = convertUnit(input.value, fromUnit, toUnit)

  let pass: boolean
  if (input.direction === 'HIGHER_IS_BETTER') {
    pass = normalizedValue >= input.threshold
  } else if (input.direction === 'LOWER_IS_BETTER') {
    pass = normalizedValue <= input.threshold
  } else {
    // TARGET_RANGE: threshold is min, targetRangeMax is max
    const max = input.targetRangeMax ?? input.threshold
    pass = normalizedValue >= input.threshold && normalizedValue <= max
  }

  return { metricId: input.metricId, value: input.value, normalizedValue, pass, missing: false, confidence: input.confidence ?? 1 }
}

export interface ComparativeResultInput {
  readonly metricId:                    string
  readonly candidateValue:              number
  readonly baselineValue:               number
  readonly direction:                   MetricDirection
  readonly minimumImprovementAbsolute:  number
  readonly nonRegressionThreshold:      number
}

export interface ComparativeResult {
  readonly metricId:                string
  readonly candidateValue:          number
  readonly baselineValue:           number
  readonly absoluteImprovement:     number
  readonly relativeImprovementPct:  number
  readonly meetsMinimumImprovement: boolean
  readonly comparativeHash:         ContentHash
  // promotionDecision intentionally absent — metric pass never promotes
}

export function buildComparativeResult(input: ComparativeResultInput): ComparativeResult {
  const { candidateValue: cand, baselineValue: base, direction } = input

  // Compute signed delta in the "improvement" direction
  const rawDelta = direction === 'LOWER_IS_BETTER' ? base - cand : cand - base
  const absoluteImprovement = rawDelta
  const relativeImprovementPct = base !== 0 ? (rawDelta / Math.abs(base)) * 100 : 0

  // Non-regression: if candidate is worse than baseline beyond threshold, reject
  // ponytail: 1e-10 epsilon handles float precision (e.g. 0.89-0.90 = -0.010000000000000009)
  if (rawDelta < -(input.nonRegressionThreshold + 1e-10)) {
    throw makeEvaluationGovernanceError('EVALUATION_METRIC_REGRESSION', `metric '${input.metricId}' regresses by ${Math.abs(rawDelta).toFixed(6)} beyond allowed threshold ${input.nonRegressionThreshold}`)
  }

  const meetsMinimumImprovement = absoluteImprovement >= input.minimumImprovementAbsolute

  const comparativeHash = canonicalMlHash({
    metricId: input.metricId,
    candidateValue: cand,
    baselineValue: base,
    direction,
    absoluteImprovement,
    relativeImprovementPct,
  }) as ContentHash

  return { metricId: input.metricId, candidateValue: cand, baselineValue: base, absoluteImprovement, relativeImprovementPct, meetsMinimumImprovement, comparativeHash }
}

// ── Task 7: Promotion Eligibility and Immutable Decision Engine ───────────────

export type PromotionDecisionOutcome = 'PROMOTED' | 'REJECTED' | 'REQUIRES_REVIEW'

export type PromotionDecisionRejectReason =
  | 'INVALID_IDENTITY'
  | 'INCOMPLETE_EVALUATION'
  | 'MISSING_BASELINE'
  | 'CONTRADICTORY_EVIDENCE'
  | 'HARD_SAFETY_FAILURE'
  | 'MANDATORY_METRIC_FAILURE'
  | 'MISSING_GOVERNANCE_EVIDENCE'
  | 'MANUAL_REVIEW_REQUIRED'
  | 'ENVIRONMENT_RESTRICTION'
  | 'POLICY_FAILURE'

export interface PromotionDecision {
  readonly decisionId:              string
  readonly evaluationId:            string
  readonly candidateArtifactId:     string
  readonly candidateCanonicalHash:  ContentHash
  readonly evaluationRunHash:       ContentHash
  readonly baselineId:              string
  readonly comparativeResultHashes: readonly ContentHash[]
  readonly governanceEvidenceHash:  ContentHash
  readonly targetEnvironments:      readonly string[]
  readonly evaluatorId:             string
  readonly requestedBy:             string
  readonly decidedAt:               IsoTimestamp
  readonly outcome:                 PromotionDecisionOutcome
  readonly rejectReason?:           PromotionDecisionRejectReason
  readonly decisionHash:            ContentHash
  readonly stage11eEvidenceRef:     { readonly evidenceId: string; readonly evidenceHash: ContentHash }
  // deploymentId and deploymentRef intentionally absent — promotion does not deploy
}

export interface PromotionDecisionInput {
  readonly decisionId:              string
  readonly evaluationId:            string
  readonly candidateArtifactId:     string
  readonly candidateCanonicalHash:  ContentHash
  readonly evaluationRunHash:       ContentHash
  readonly baselineId:              string
  readonly comparativeResultHashes: readonly ContentHash[]
  readonly governanceEvidenceHash:  ContentHash
  readonly targetEnvironments:      readonly string[]
  readonly evaluatorId:             string
  readonly requestedBy:             string
  readonly decidedAt:               IsoTimestamp
  readonly stage11eEvidenceRef:     { readonly evidenceId: string; readonly evidenceHash: ContentHash }
}

export function makePromotionDecision(
  input: PromotionDecisionInput,
  outcome: PromotionDecisionOutcome,
  rejectReason?: PromotionDecisionRejectReason,
  store?: Map<string, PromotionDecision>,
): PromotionDecision {
  // Decision order (spec §7): identity → evaluation completeness → baseline → contradictory evidence
  //   → hard safety → mandatory metric → governance evidence → manual review → environment → decision
  if (!input.decisionId?.trim()) throw makeEvaluationGovernanceError('EVALUATION_INVALID_IDENTITY', 'decisionId must be non-empty')
  if (!input.candidateArtifactId?.trim()) throw makeEvaluationGovernanceError('EVALUATION_INVALID_IDENTITY', 'candidateArtifactId must be non-empty')
  if (!HASH_RE.test(input.candidateCanonicalHash)) throw makeEvaluationGovernanceError('EVALUATION_CANDIDATE_HASH_MISMATCH', 'candidateCanonicalHash must be sha256:<64 hex chars>')
  if (input.evaluatorId === input.candidateArtifactId) throw makeEvaluationGovernanceError('EVALUATION_NO_PROMOTION_AUTHORITY', 'evaluator cannot self-promote: evaluatorId matches candidateArtifactId')
  if (!input.targetEnvironments.length) throw makeEvaluationGovernanceError('EVALUATION_ENVIRONMENT_INELIGIBLE', 'at least one target environment is required')
  if (!input.stage11eEvidenceRef.evidenceId?.trim()) throw makeEvaluationGovernanceError('EVALUATION_EVIDENCE_FAILURE', 'stage11eEvidenceRef.evidenceId must be non-empty')
  if (!HASH_RE.test(input.stage11eEvidenceRef.evidenceHash)) throw makeEvaluationGovernanceError('EVALUATION_EVIDENCE_FAILURE', 'stage11eEvidenceRef.evidenceHash must be sha256:<64 hex chars>')

  const decisionHash = canonicalMlHash({
    decisionId: input.decisionId,
    evaluationId: input.evaluationId,
    candidateArtifactId: input.candidateArtifactId,
    candidateCanonicalHash: input.candidateCanonicalHash,
    evaluationRunHash: input.evaluationRunHash,
    outcome,
    rejectReason: rejectReason ?? null,
    targetEnvironments: [...input.targetEnvironments].sort(),
    evidenceId: input.stage11eEvidenceRef.evidenceId,
  }) as ContentHash

  if (store) {
    const existing = store.get(input.decisionId)
    if (existing) {
      if (existing.decisionHash === decisionHash) return existing
      throw makeEvaluationGovernanceError('EVALUATION_DECISION_CONFLICT', `decision ${input.decisionId} already exists with different content — decisions are immutable`)
    }
  }

  const decision: PromotionDecision = {
    ...input,
    outcome,
    decisionHash,
    ...(rejectReason ? { rejectReason } : {}),
  }

  store?.set(input.decisionId, decision)
  return decision
}
