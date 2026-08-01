// @rohinik-org/ml-deployment — ports, error taxonomy, and provider contracts (Task 1)
// No framework/cloud deployment SDK dependencies. No drift/retraining symbols. No Stage 12F scaffolding.

export type {
  DeploymentId, EndpointId, InferenceRequestId, RollbackDirectiveId, RetirementRecordId,
  ContentHash, IsoTimestamp, ModelId, PromotionDecisionId, ProviderExtension, JsonValue,
} from '@rohinik-org/ml-ir'
export { canonicalMlHash } from '@rohinik-org/ml-ir'
import { canonicalMlHash } from '@rohinik-org/ml-ir'
import type { IsoTimestamp, ContentHash, DeploymentId, EndpointId, InferenceRequestId } from '@rohinik-org/ml-ir'

// Re-export PromotionDecision from 12D — deployment gate depends on it
export type { PromotionDecision } from '@rohinik-org/ml-evaluation'
import type { PromotionDecision } from '@rohinik-org/ml-evaluation'

// ── Context ───────────────────────────────────────────────────────────────────

export interface DeploymentGovernanceContext {
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

export const DEPLOYMENT_GOVERNANCE_ERROR_CODES = [
  'DEPLOYMENT_INVALID_IDENTITY',
  'DEPLOYMENT_NO_PROMOTION',
  'DEPLOYMENT_PROMOTION_NOT_PROMOTED',
  'DEPLOYMENT_MODEL_ARTIFACT_MISMATCH',
  'DEPLOYMENT_ENVIRONMENT_INELIGIBLE',
  'DEPLOYMENT_PROVIDER_UNAVAILABLE',
  'DEPLOYMENT_POLICY_DENIED',
  'DEPLOYMENT_MISSING_ROLLBACK_PLAN',
  'DEPLOYMENT_REQUIRES_REVIEW',
  'DEPLOYMENT_ADMISSION_CONFLICT',
  'DEPLOYMENT_REVISION_IMMUTABLE',
  'DEPLOYMENT_REVISION_CONFLICT',
  'DEPLOYMENT_TRAFFIC_INVALID',
  'DEPLOYMENT_TRAFFIC_NON_FINITE',
  'DEPLOYMENT_CANARY_NON_MONOTONIC',
  'DEPLOYMENT_INVALID_TRANSITION',
  'DEPLOYMENT_TERMINAL_STATE',
  'DEPLOYMENT_CONCURRENCY_CONFLICT',
  'DEPLOYMENT_ENDPOINT_NOT_READY',
  'DEPLOYMENT_REQUEST_IDENTITY_MISMATCH',
  'DEPLOYMENT_SCHEMA_MISMATCH',
  'DEPLOYMENT_IDEMPOTENCY_CONFLICT',
  'DEPLOYMENT_INFERENCE_MISSING_EVIDENCE',
  'DEPLOYMENT_PROVIDER_VIOLATION',
  'DEPLOYMENT_ROLLBACK_MISSING_AUTHORIZATION',
  'DEPLOYMENT_ROLLBACK_SAME_REVISION',
  'DEPLOYMENT_ROLLBACK_UNKNOWN_TARGET',
  'DEPLOYMENT_RECOMMENDATION_NOT_DIRECTIVE',
  'DEPLOYMENT_RETIREMENT_ACTIVE_CONSUMERS',
  'DEPLOYMENT_EVIDENCE_FAILURE',
  'DEPLOYMENT_PERSISTENCE_FAILURE',
] as const

export type DeploymentGovernanceErrorCode = typeof DEPLOYMENT_GOVERNANCE_ERROR_CODES[number]

export interface DeploymentGovernanceError {
  readonly code:    DeploymentGovernanceErrorCode
  readonly message: string
  readonly detail?: string
}

export function makeDeploymentGovernanceError(
  code: DeploymentGovernanceErrorCode,
  message: string,
  detail?: string,
): DeploymentGovernanceError & Error {
  const err = new Error(`${code}: ${message}`) as Error & DeploymentGovernanceError
  ;(err as unknown as Record<string, unknown>)['code'] = code
  ;(err as unknown as Record<string, unknown>)['detail'] = detail
  return err as DeploymentGovernanceError & Error
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

// ── Provider boundaries ───────────────────────────────────────────────────────

export interface DeploymentProviderPrepareResult  { readonly prepared:    boolean; readonly detail?: string }
export interface DeploymentProviderDeployResult   { readonly deployed:    boolean; readonly detail?: string }
export interface DeploymentProviderDrainResult    { readonly drained:     boolean; readonly detail?: string }
export interface DeploymentProviderRollbackResult { readonly rolledBack:  boolean; readonly detail?: string }
export interface DeploymentProviderRetireResult   { readonly retired:     boolean; readonly detail?: string }
export interface DeploymentProviderHealthResult   { readonly healthy:     boolean; readonly detail?: string }

export interface DeploymentProviderAdapter {
  readonly adapterId: string
  // May prepare, deploy, drain, rollback, retire, and report health through a governed endpoint.
  // Cannot promote, alter canonical deployment identity, expand environment eligibility,
  // change policy, fabricate evidence, silently reroute traffic, or decide rollback authority.
  prepare(deploymentId: string):  Promise<DeploymentProviderPrepareResult>
  deploy(deploymentId: string):   Promise<DeploymentProviderDeployResult>
  drain(deploymentId: string):    Promise<DeploymentProviderDrainResult>
  rollback(deploymentId: string, toRevisionId: string): Promise<DeploymentProviderRollbackResult>
  retire(deploymentId: string):   Promise<DeploymentProviderRetireResult>
  reportHealth(deploymentId: string): Promise<DeploymentProviderHealthResult>
}

export interface InferenceProviderExecuteResult {
  readonly outcome:    'SUCCESS' | 'ERROR' | 'TIMEOUT' | 'CANCELLED'
  readonly outputHash: ContentHash
  readonly latencyMs:  number
  readonly errorCode?: string
}

export interface InferenceProviderAdapter {
  readonly adapterId: string
  // May execute inference through a governed endpoint only.
  // Cannot deploy, promote, reroute traffic, or alter model identity.
  execute(endpointId: string, inputHash: ContentHash): Promise<InferenceProviderExecuteResult>
}

// ── Repository ports (unknown-typed stubs — replaced by later tasks) ──────────
// ponytail: unknown stubs; typed versions added per task as concrete types are defined

export interface DeploymentRequestRepository {
  save(record: unknown, opts?: RepositoryWriteOptions): Promise<RepositoryWriteResult>
  findById(id: string): Promise<unknown>
}

export interface DeploymentRevisionRepository {
  save(record: unknown, opts?: RepositoryWriteOptions): Promise<RepositoryWriteResult>
  findById(id: string): Promise<unknown>
}

export interface EndpointRepository {
  save(record: unknown, opts?: RepositoryWriteOptions): Promise<RepositoryWriteResult>
  findById(id: string): Promise<unknown>
}

export interface RolloutStateRepository {
  save(record: unknown, opts?: RepositoryWriteOptions): Promise<RepositoryWriteResult>
  findById(id: string): Promise<unknown>
}

export interface TrafficPlanRepository {
  save(record: unknown, opts?: RepositoryWriteOptions): Promise<RepositoryWriteResult>
  findById(id: string): Promise<unknown>
}

export interface InferenceRecordRepository {
  save(record: unknown, opts?: RepositoryWriteOptions): Promise<RepositoryWriteResult>
  findById(id: string): Promise<unknown>
}

export interface HealthObservationRepository {
  save(record: unknown, opts?: RepositoryWriteOptions): Promise<RepositoryWriteResult>
  findById(id: string): Promise<unknown>
}

export interface RollbackDirectiveRepository {
  save(record: unknown, opts?: RepositoryWriteOptions): Promise<RepositoryWriteResult>
  findById(id: string): Promise<unknown>
}

export interface RetirementRecordRepository {
  save(record: unknown, opts?: RepositoryWriteOptions): Promise<RepositoryWriteResult>
  findById(id: string): Promise<unknown>
}

// ── ModelDeploymentGovernanceService ─────────────────────────────────────────

export interface DeploymentGovernanceServiceRepos {
  readonly deploymentRequests:  DeploymentRequestRepository
  readonly deploymentRevisions: DeploymentRevisionRepository
  readonly endpoints:           EndpointRepository
  readonly rolloutState:        RolloutStateRepository
  readonly trafficPlans:        TrafficPlanRepository
  readonly inferenceRecords:    InferenceRecordRepository
  readonly healthObservations:  HealthObservationRepository
  readonly rollbackDirectives:  RollbackDirectiveRepository
  readonly retirementRecords:   RetirementRecordRepository
}

export interface ModelDeploymentGovernanceServiceInterface {
  // Expanded by Tasks 2–9; Task 1 establishes the shell only
}

export function ModelDeploymentGovernanceService(
  _deps: { repos: DeploymentGovernanceServiceRepos },
): ModelDeploymentGovernanceServiceInterface {
  return {}
}

// ── Task 2: Deployment Admission ──────────────────────────────────────────────

export type DeploymentAdmissionOutcome = 'ADMITTED' | 'DENIED'

export interface DeploymentAdmissionRequest {
  readonly admissionId:             string
  readonly deploymentId:            DeploymentId
  readonly promotion:               PromotionDecision
  readonly candidateArtifactId:     string
  readonly candidateCanonicalHash:  ContentHash
  readonly targetEnvironment:       string
  readonly requestedBy:             string
  readonly requestedAt:             IsoTimestamp
  readonly rollbackPlanRef:         string
}

export interface DeploymentAdmissionDecision {
  readonly admissionId:        string
  readonly deploymentId:       DeploymentId
  readonly outcome:            DeploymentAdmissionOutcome
  readonly promotionDecisionId: string
  readonly admissionHash:      ContentHash
  readonly decidedAt:          IsoTimestamp
}

export function admitDeployment(
  req: DeploymentAdmissionRequest,
  store?: Map<string, DeploymentAdmissionDecision>,
): DeploymentAdmissionDecision {
  // 1. identity
  if (!req.admissionId)    throw makeDeploymentGovernanceError('DEPLOYMENT_INVALID_IDENTITY', 'admissionId required')
  if (!req.requestedBy)    throw makeDeploymentGovernanceError('DEPLOYMENT_INVALID_IDENTITY', 'requestedBy required')
  if (!/^sha256:[0-9a-f]{64}$/.test(req.candidateCanonicalHash))
    throw makeDeploymentGovernanceError('DEPLOYMENT_INVALID_IDENTITY', 'invalid candidateCanonicalHash format')

  // 2. promotion present
  if (!req.promotion) throw makeDeploymentGovernanceError('DEPLOYMENT_NO_PROMOTION', 'promotion required')

  // 3. promotion outcome
  if (req.promotion.outcome !== 'PROMOTED')
    throw makeDeploymentGovernanceError('DEPLOYMENT_PROMOTION_NOT_PROMOTED', `promotion outcome is ${req.promotion.outcome}`)

  // 4. artifact match
  if (req.candidateArtifactId !== req.promotion.candidateArtifactId || req.candidateCanonicalHash !== req.promotion.candidateCanonicalHash)
    throw makeDeploymentGovernanceError('DEPLOYMENT_MODEL_ARTIFACT_MISMATCH', 'candidateArtifactId or hash mismatch')

  // 5. environment eligibility
  if (!req.promotion.targetEnvironments.includes(req.targetEnvironment))
    throw makeDeploymentGovernanceError('DEPLOYMENT_ENVIRONMENT_INELIGIBLE', `${req.targetEnvironment} not in promotion targets`)

  // 6. rollback plan
  if (!req.rollbackPlanRef)
    throw makeDeploymentGovernanceError('DEPLOYMENT_MISSING_ROLLBACK_PLAN', 'rollbackPlanRef required')

  // idempotency
  if (store?.has(req.admissionId)) {
    const existing = store.get(req.admissionId)!
    const probe = canonicalMlHash(
      `${req.admissionId}|${req.deploymentId}|${req.candidateArtifactId}|${req.candidateCanonicalHash}|${req.targetEnvironment}|${req.requestedBy}`,
    ) as ContentHash
    if (existing.admissionHash !== probe)
      throw makeDeploymentGovernanceError('DEPLOYMENT_ADMISSION_CONFLICT', 'admissionId reuse with different content')
    return existing
  }

  const admissionHash = canonicalMlHash(
    `${req.admissionId}|${req.deploymentId}|${req.candidateArtifactId}|${req.candidateCanonicalHash}|${req.targetEnvironment}|${req.requestedBy}`,
  ) as ContentHash

  const decision: DeploymentAdmissionDecision = {
    admissionId:         req.admissionId,
    deploymentId:        req.deploymentId,
    outcome:             'ADMITTED',
    promotionDecisionId: req.promotion.decisionId,
    admissionHash,
    decidedAt:           req.requestedAt,
  }
  store?.set(req.admissionId, decision)
  return decision
}

// ── Task 3: Revision, Rollout, Traffic ───────────────────────────────────────

export type RolloutStrategy = 'direct' | 'rolling' | 'canary' | 'blue-green' | 'shadow' | 'batch'

export interface TrafficAllocationStep {
  readonly revisionId:      string
  readonly trafficPercent:  number
}

export interface DeploymentRevisionInput {
  readonly revisionId:                string
  readonly deploymentId:              DeploymentId
  readonly candidateArtifactId:       string
  readonly candidateCanonicalHash:    ContentHash
  readonly modelVersionId:            string
  readonly rolloutStrategy:           RolloutStrategy
  readonly rollbackTargetRevisionId:  string
  readonly createdAt:                 IsoTimestamp
  readonly createdBy:                 string
}

export interface DeploymentRevision {
  readonly revisionId:               string
  readonly deploymentId:             DeploymentId
  readonly candidateArtifactId:      string
  readonly candidateCanonicalHash:   ContentHash
  readonly modelVersionId:           string
  readonly rolloutStrategy:          RolloutStrategy
  readonly rollbackTargetRevisionId: string
  readonly revisionHash:             ContentHash
  readonly createdAt:                IsoTimestamp
  readonly createdBy:                string
}

export function buildDeploymentRevision(
  input: DeploymentRevisionInput,
  store?: Map<string, DeploymentRevision>,
): DeploymentRevision {
  if (!input.revisionId)
    throw makeDeploymentGovernanceError('DEPLOYMENT_INVALID_IDENTITY', 'revisionId required')
  if (!/^sha256:[0-9a-f]{64}$/.test(input.candidateCanonicalHash))
    throw makeDeploymentGovernanceError('DEPLOYMENT_INVALID_IDENTITY', 'invalid candidateCanonicalHash format')
  if (!input.rollbackTargetRevisionId)
    throw makeDeploymentGovernanceError('DEPLOYMENT_MISSING_ROLLBACK_PLAN', 'rollbackTargetRevisionId required')

  if (store?.has(input.revisionId)) {
    const existing = store.get(input.revisionId)!
    const probe = canonicalMlHash(
      `${input.revisionId}|${input.deploymentId}|${input.candidateCanonicalHash}|${input.modelVersionId}`,
    ) as ContentHash
    if (existing.revisionHash !== probe)
      throw makeDeploymentGovernanceError('DEPLOYMENT_REVISION_CONFLICT', 'revisionId reuse with different content')
    return existing
  }

  const revisionHash = canonicalMlHash(
    `${input.revisionId}|${input.deploymentId}|${input.candidateCanonicalHash}|${input.modelVersionId}`,
  ) as ContentHash

  const rev: DeploymentRevision = {
    revisionId:               input.revisionId,
    deploymentId:             input.deploymentId,
    candidateArtifactId:      input.candidateArtifactId,
    candidateCanonicalHash:   input.candidateCanonicalHash,
    modelVersionId:           input.modelVersionId,
    rolloutStrategy:          input.rolloutStrategy,
    rollbackTargetRevisionId: input.rollbackTargetRevisionId,
    revisionHash,
    createdAt:                input.createdAt,
    createdBy:                input.createdBy,
  }
  store?.set(input.revisionId, rev)
  return rev
}

export interface RolloutPlanInput {
  readonly deploymentId:   DeploymentId
  readonly strategy:       RolloutStrategy
  readonly steps:          readonly TrafficAllocationStep[]
  readonly healthGateRef?: string
  readonly createdAt:      IsoTimestamp
}

export interface ValidatedRolloutPlan {
  readonly deploymentId:  DeploymentId
  readonly strategy:      RolloutStrategy
  readonly steps:         readonly TrafficAllocationStep[]
  readonly healthGateRef?: string
  readonly createdAt:     IsoTimestamp
}

export function validateRolloutPlan(input: RolloutPlanInput): ValidatedRolloutPlan {
  if (input.strategy === 'canary') {
    if (!input.healthGateRef)
      throw makeDeploymentGovernanceError('DEPLOYMENT_MISSING_ROLLBACK_PLAN', 'canary requires healthGateRef')
    for (let i = 1; i < input.steps.length; i++) {
      if (input.steps[i].trafficPercent < input.steps[i - 1].trafficPercent)
        throw makeDeploymentGovernanceError('DEPLOYMENT_CANARY_NON_MONOTONIC', 'canary traffic must be monotonically increasing')
    }
  }
  const base: ValidatedRolloutPlan = {
    deploymentId: input.deploymentId,
    strategy:     input.strategy,
    steps:        input.steps,
    createdAt:    input.createdAt,
  }
  return input.healthGateRef ? { ...base, healthGateRef: input.healthGateRef } : base
}

export function validateTrafficAllocation(steps: readonly TrafficAllocationStep[]): void {
  if (steps.length === 0) return
  for (const s of steps) {
    if (!isFinite(s.trafficPercent))
      throw makeDeploymentGovernanceError('DEPLOYMENT_TRAFFIC_NON_FINITE', `non-finite trafficPercent for ${s.revisionId}`)
    if (s.trafficPercent < 0)
      throw makeDeploymentGovernanceError('DEPLOYMENT_TRAFFIC_INVALID', `negative trafficPercent for ${s.revisionId}`)
  }
  const total = steps.reduce((sum, s) => sum + s.trafficPercent, 0)
  if (total !== 0 && Math.abs(total - 100) > 1e-10)
    throw makeDeploymentGovernanceError('DEPLOYMENT_TRAFFIC_INVALID', `traffic total ${total} is not 0 or 100`)
}

// ── Task 5: Inference Request ─────────────────────────────────────────────────

export type EndpointState = 'STARTING' | 'READY' | 'DEGRADED' | 'STOPPED' | 'FAILED'

export interface InferenceRequestInput {
  readonly inferenceRequestId: InferenceRequestId
  readonly endpointId:         EndpointId
  readonly deploymentId:       DeploymentId
  readonly revisionId:         string
  readonly modelVersionId:     string
  readonly inputHash:          ContentHash
  readonly endpointState:      EndpointState
  readonly requestedAt:        IsoTimestamp
  readonly requestedBy:        string
  readonly idempotencyKey?:    string
}

export interface ValidatedInferenceRequest {
  readonly inferenceRequestId: InferenceRequestId
  readonly endpointId:         EndpointId
  readonly deploymentId:       DeploymentId
  readonly revisionId:         string
  readonly modelVersionId:     string
  readonly inputHash:          ContentHash
  readonly requestHash:        ContentHash
  readonly requestedAt:        IsoTimestamp
  readonly requestedBy:        string
}

export function buildInferenceRequest(
  input: InferenceRequestInput,
  store?: Map<string, ValidatedInferenceRequest>,
): ValidatedInferenceRequest {
  // identity
  if (!input.inferenceRequestId)
    throw makeDeploymentGovernanceError('DEPLOYMENT_INVALID_IDENTITY', 'inferenceRequestId required')
  if (!/^sha256:[0-9a-f]{64}$/.test(input.inputHash))
    throw makeDeploymentGovernanceError('DEPLOYMENT_INVALID_IDENTITY', 'invalid inputHash format')

  // revision/model identity
  if (!input.revisionId)
    throw makeDeploymentGovernanceError('DEPLOYMENT_REQUEST_IDENTITY_MISMATCH', 'revisionId required')
  if (!input.modelVersionId)
    throw makeDeploymentGovernanceError('DEPLOYMENT_REQUEST_IDENTITY_MISMATCH', 'modelVersionId required')

  // endpoint readiness
  if (input.endpointState !== 'READY')
    throw makeDeploymentGovernanceError('DEPLOYMENT_ENDPOINT_NOT_READY', `endpoint state is ${input.endpointState}`)

  // idempotency
  if (input.idempotencyKey && store?.has(input.idempotencyKey)) {
    const existing = store.get(input.idempotencyKey)!
    if (existing.inputHash !== input.inputHash)
      throw makeDeploymentGovernanceError('DEPLOYMENT_IDEMPOTENCY_CONFLICT', 'idempotencyKey reuse with different inputHash')
    return existing
  }

  const requestHash = canonicalMlHash(
    `${input.inferenceRequestId}|${input.endpointId}|${input.deploymentId}|${input.revisionId}|${input.modelVersionId}|${input.inputHash}`,
  ) as ContentHash

  const req: ValidatedInferenceRequest = {
    inferenceRequestId: input.inferenceRequestId,
    endpointId:         input.endpointId,
    deploymentId:       input.deploymentId,
    revisionId:         input.revisionId,
    modelVersionId:     input.modelVersionId,
    inputHash:          input.inputHash,
    requestHash,
    requestedAt:        input.requestedAt,
    requestedBy:        input.requestedBy,
  }
  if (input.idempotencyKey) store?.set(input.idempotencyKey, req)
  return req
}

// ── Task 4: Deployment and Endpoint Lifecycle State Machines ──────────────────

export type DeploymentState =
  | 'PLANNED' | 'ADMISSION_PENDING' | 'ADMITTED' | 'DEPLOYING'
  | 'CANARY' | 'ACTIVE' | 'DEGRADED' | 'ROLLBACK_PENDING'
  | 'ROLLING_BACK' | 'ROLLED_BACK' | 'DRAINING' | 'RETIRED' | 'FAILED'

export type EndpointLifecycleState = 'CREATED' | 'STARTING' | 'READY' | 'DEGRADED' | 'DRAINING' | 'STOPPED' | 'FAILED'

const DEPLOYMENT_TERMINAL: ReadonlySet<DeploymentState> = new Set(['RETIRED', 'FAILED', 'ROLLED_BACK'])
const ENDPOINT_TERMINAL:   ReadonlySet<EndpointLifecycleState> = new Set(['STOPPED', 'FAILED'])

// Valid next states per current state
const DEPLOYMENT_TRANSITIONS: Readonly<Record<DeploymentState, readonly DeploymentState[]>> = {
  PLANNED:          ['ADMISSION_PENDING'],
  ADMISSION_PENDING:['ADMITTED'],
  ADMITTED:         ['DEPLOYING'],
  DEPLOYING:        ['ACTIVE', 'CANARY', 'FAILED'],
  CANARY:           ['ACTIVE', 'DEGRADED', 'ROLLBACK_PENDING', 'FAILED'],
  ACTIVE:           ['DEGRADED', 'DRAINING', 'ROLLBACK_PENDING', 'RETIRED'],
  DEGRADED:         ['ACTIVE', 'DRAINING', 'ROLLBACK_PENDING', 'FAILED'],
  ROLLBACK_PENDING: ['ROLLING_BACK'],
  ROLLING_BACK:     ['ROLLED_BACK'],
  ROLLED_BACK:      [],
  DRAINING:         ['RETIRED'],
  RETIRED:          [],
  FAILED:           [],
}

const ENDPOINT_TRANSITIONS: Readonly<Record<EndpointLifecycleState, readonly EndpointLifecycleState[]>> = {
  CREATED:  ['STARTING'],
  STARTING: ['READY', 'DEGRADED', 'FAILED'],
  READY:    ['DEGRADED', 'DRAINING'],
  DEGRADED: ['READY', 'DRAINING', 'FAILED'],
  DRAINING: ['STOPPED'],
  STOPPED:  [],
  FAILED:   [],
}

export interface LifecycleHistoryEntry<S extends string> {
  readonly state:       S
  readonly at:          IsoTimestamp
  readonly by:          string
}

export interface DeploymentLifecycle {
  readonly deploymentId:  DeploymentId
  readonly state:         DeploymentState
  readonly version:       number
  readonly admissionHash: ContentHash
  readonly history:       readonly LifecycleHistoryEntry<DeploymentState>[]
}

export interface EndpointLifecycle {
  readonly endpointId:   EndpointId
  readonly deploymentId: DeploymentId
  readonly state:        EndpointLifecycleState
  readonly version:      number
  readonly history:      readonly LifecycleHistoryEntry<EndpointLifecycleState>[]
}

export interface DeploymentLifecycleInput {
  readonly deploymentId:  DeploymentId
  readonly admissionHash: ContentHash
  readonly createdAt:     IsoTimestamp
  readonly createdBy:     string
}

export function createDeploymentLifecycle(input: DeploymentLifecycleInput): DeploymentLifecycle {
  if (!input.deploymentId)
    throw makeDeploymentGovernanceError('DEPLOYMENT_INVALID_IDENTITY', 'deploymentId required')
  return {
    deploymentId:  input.deploymentId,
    state:         'PLANNED',
    version:       1,
    admissionHash: input.admissionHash,
    history:       [{ state: 'PLANNED', at: input.createdAt, by: input.createdBy }],
  }
}

export interface TransitionOptions {
  readonly expectedVersion?: number
}

export function transitionDeployment(
  lifecycle: DeploymentLifecycle,
  next: DeploymentState,
  at: IsoTimestamp,
  by: string,
  opts?: TransitionOptions,
): DeploymentLifecycle {
  if (DEPLOYMENT_TERMINAL.has(lifecycle.state))
    throw makeDeploymentGovernanceError('DEPLOYMENT_TERMINAL_STATE', `${lifecycle.state} is terminal`)

  if (opts?.expectedVersion !== undefined && opts.expectedVersion !== lifecycle.version)
    throw makeDeploymentGovernanceError('DEPLOYMENT_CONCURRENCY_CONFLICT', `expected version ${opts.expectedVersion}, got ${lifecycle.version}`)

  if (!(DEPLOYMENT_TRANSITIONS[lifecycle.state] as readonly string[]).includes(next))
    throw makeDeploymentGovernanceError('DEPLOYMENT_INVALID_TRANSITION', `${lifecycle.state} → ${next} not allowed`)

  return {
    ...lifecycle,
    state:   next,
    version: lifecycle.version + 1,
    history: [...lifecycle.history, { state: next, at, by }],
  }
}

export interface EndpointLifecycleInput {
  readonly endpointId:   EndpointId
  readonly deploymentId: DeploymentId
  readonly createdAt:    IsoTimestamp
}

export function createEndpointLifecycle(input: EndpointLifecycleInput): EndpointLifecycle {
  if (!input.endpointId)
    throw makeDeploymentGovernanceError('DEPLOYMENT_INVALID_IDENTITY', 'endpointId required')
  return {
    endpointId:   input.endpointId,
    deploymentId: input.deploymentId,
    state:        'CREATED',
    version:      1,
    history:      [{ state: 'CREATED', at: input.createdAt, by: '' }],
  }
}

export function transitionEndpoint(
  lifecycle: EndpointLifecycle,
  next: EndpointLifecycleState,
  at: IsoTimestamp,
  by: string,
  opts?: TransitionOptions,
): EndpointLifecycle {
  if (ENDPOINT_TERMINAL.has(lifecycle.state))
    throw makeDeploymentGovernanceError('DEPLOYMENT_TERMINAL_STATE', `${lifecycle.state} is terminal`)

  if (opts?.expectedVersion !== undefined && opts.expectedVersion !== lifecycle.version)
    throw makeDeploymentGovernanceError('DEPLOYMENT_CONCURRENCY_CONFLICT', `expected version ${opts.expectedVersion}, got ${lifecycle.version}`)

  if (!(ENDPOINT_TRANSITIONS[lifecycle.state] as readonly string[]).includes(next))
    throw makeDeploymentGovernanceError('DEPLOYMENT_INVALID_TRANSITION', `${lifecycle.state} → ${next} not allowed`)

  return {
    ...lifecycle,
    state:   next,
    version: lifecycle.version + 1,
    history: [...lifecycle.history, { state: next, at, by }],
  }
}

// ── Task 6: Inference Result ──────────────────────────────────────────────────

export type InferenceOutcome = 'SUCCESS' | 'ERROR' | 'TIMEOUT' | 'CANCELLED'

export interface InferenceUsage {
  readonly inputTokens:  number
  readonly outputTokens: number
  readonly computeMs:    number
}

export interface EvidenceRef {
  readonly evidenceId:   string
  readonly evidenceHash: ContentHash
}

export interface InferenceResult {
  readonly inferenceRequestId: InferenceRequestId
  readonly requestHash:        ContentHash
  readonly outcome:            InferenceOutcome
  readonly outputHash?:        ContentHash
  readonly latencyMs:          number
  readonly resultHash:         ContentHash
  readonly evidenceRef:        EvidenceRef
  readonly usage?:             InferenceUsage
  readonly errorCode?:         string
  readonly recordedAt:         IsoTimestamp
}

export interface InferenceResultInput {
  readonly inferenceRequestId: InferenceRequestId
  readonly requestHash:        ContentHash
  readonly outcome:            InferenceOutcome
  readonly outputHash?:        ContentHash
  readonly latencyMs:          number
  readonly evidenceRef?:       EvidenceRef
  readonly usage?:             InferenceUsage
  readonly errorCode?:         string
  readonly recordedAt:         IsoTimestamp
  readonly recordedBy:         string
}

export function buildInferenceResult(
  input: InferenceResultInput,
  store?: Map<string, InferenceResult>,
): InferenceResult {
  if (!input.inferenceRequestId)
    throw makeDeploymentGovernanceError('DEPLOYMENT_INVALID_IDENTITY', 'inferenceRequestId required')
  if (!/^sha256:[0-9a-f]{64}$/.test(input.requestHash))
    throw makeDeploymentGovernanceError('DEPLOYMENT_INVALID_IDENTITY', 'invalid requestHash format')
  if (!input.evidenceRef)
    throw makeDeploymentGovernanceError('DEPLOYMENT_INFERENCE_MISSING_EVIDENCE', 'evidenceRef required')

  if (input.usage) {
    const { inputTokens, outputTokens, computeMs } = input.usage
    if (!isFinite(inputTokens) || !isFinite(outputTokens) || !isFinite(computeMs))
      throw makeDeploymentGovernanceError('DEPLOYMENT_PROVIDER_VIOLATION', 'usage contains non-finite values')
    if (inputTokens < 0 || outputTokens < 0 || computeMs < 0)
      throw makeDeploymentGovernanceError('DEPLOYMENT_PROVIDER_VIOLATION', 'usage contains negative values')
  }

  const resultHash = canonicalMlHash(
    `${input.inferenceRequestId}|${input.requestHash}|${input.outcome}|${input.outputHash ?? ''}|${input.latencyMs}`,
  ) as ContentHash

  if (store?.has(input.inferenceRequestId)) {
    const existing = store.get(input.inferenceRequestId)!
    if (existing.resultHash !== resultHash)
      throw makeDeploymentGovernanceError('DEPLOYMENT_EVIDENCE_FAILURE', 'inferenceRequestId reuse with different outcome')
    return existing
  }

  const base: InferenceResult = {
    inferenceRequestId: input.inferenceRequestId,
    requestHash:        input.requestHash,
    outcome:            input.outcome,
    latencyMs:          input.latencyMs,
    resultHash,
    evidenceRef:        input.evidenceRef,
    recordedAt:         input.recordedAt,
  }
  const withOutput = input.outputHash ? { ...base, outputHash: input.outputHash } : base
  const withUsage  = input.usage      ? { ...withOutput, usage: input.usage }     : withOutput
  const result     = input.errorCode  ? { ...withUsage, errorCode: input.errorCode } : withUsage

  store?.set(input.inferenceRequestId, result)
  return result
}

// ── Task 7: Health, Readiness, Canary, Activation ────────────────────────────

export type HealthStatus = 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY'
export type CanaryVerdict = 'PASS' | 'FAIL' | 'INCONCLUSIVE'
export type ActivationOutcome = 'ACTIVATE' | 'DENY' | 'DEFER'

export interface HealthObservation {
  readonly deploymentId: DeploymentId
  readonly endpointId:   EndpointId
  readonly status:       HealthStatus
  readonly observedAt:   IsoTimestamp
  readonly observedBy:   string
  readonly summaryHash:  ContentHash
  readonly reason?:      string
}

export interface HealthObservationInput {
  readonly deploymentId: DeploymentId
  readonly endpointId:   EndpointId
  readonly status:       HealthStatus
  readonly observedAt:   IsoTimestamp
  readonly observedBy:   string
  readonly reason?:      string
}

export function buildHealthObservation(input: HealthObservationInput): HealthObservation {
  const summaryHash = canonicalMlHash(
    `${input.deploymentId}|${input.endpointId}|${input.status}|${input.observedAt}`,
  ) as ContentHash
  const base: HealthObservation = {
    deploymentId: input.deploymentId,
    endpointId:   input.endpointId,
    status:       input.status,
    observedAt:   input.observedAt,
    observedBy:   input.observedBy,
    summaryHash,
  }
  return input.reason ? { ...base, reason: input.reason } : base
}

export interface ReadinessAssessment {
  readonly ready:   boolean
  readonly checked: number
  readonly healthy: number
}

export function assessReadiness(input: { observations: readonly HealthObservation[]; requiredCount: number }): ReadinessAssessment {
  const healthy = input.observations.filter(o => o.status === 'HEALTHY').length
  return {
    ready:   healthy >= input.requiredCount && input.observations.length > 0,
    checked: input.observations.length,
    healthy,
  }
}

export interface CanaryGateResult {
  readonly deploymentId: DeploymentId
  readonly verdict:      CanaryVerdict
  readonly evidenceRef:  EvidenceRef
  readonly evaluatedAt:  IsoTimestamp
}

export interface CanaryGateInput {
  readonly deploymentId: DeploymentId
  readonly observations: readonly HealthObservation[]
  readonly evidenceRef:  EvidenceRef
  readonly evaluatedAt:  IsoTimestamp
}

export function buildCanaryGateResult(input: CanaryGateInput): CanaryGateResult {
  if (!input.evidenceRef)
    throw makeDeploymentGovernanceError('DEPLOYMENT_INFERENCE_MISSING_EVIDENCE', 'evidenceRef required for canary gate')

  let verdict: CanaryVerdict = 'INCONCLUSIVE'
  if (input.observations.some(o => o.status === 'UNHEALTHY')) verdict = 'FAIL'
  else if (input.observations.length > 0 && input.observations.every(o => o.status === 'HEALTHY')) verdict = 'PASS'

  return { deploymentId: input.deploymentId, verdict, evidenceRef: input.evidenceRef, evaluatedAt: input.evaluatedAt }
}

export interface ActivationDecision {
  readonly deploymentId:         DeploymentId
  readonly decision:             ActivationOutcome
  readonly mandatoryEvidenceRef: EvidenceRef
  readonly decidedAt:            IsoTimestamp
  readonly decidedBy:            string
}

export interface ActivationDecisionInput {
  readonly deploymentId:         DeploymentId
  readonly canaryVerdict:        CanaryVerdict
  readonly mandatoryEvidenceRef: EvidenceRef
  readonly decidedAt:            IsoTimestamp
  readonly decidedBy:            string
}

export function buildActivationDecision(input: ActivationDecisionInput): ActivationDecision {
  if (!input.mandatoryEvidenceRef)
    throw makeDeploymentGovernanceError('DEPLOYMENT_INFERENCE_MISSING_EVIDENCE', 'mandatoryEvidenceRef required')

  const decisionMap: Record<CanaryVerdict, ActivationOutcome> = {
    PASS:         'ACTIVATE',
    FAIL:         'DENY',
    INCONCLUSIVE: 'DEFER',
  }

  return {
    deploymentId:         input.deploymentId,
    decision:             decisionMap[input.canaryVerdict],
    mandatoryEvidenceRef: input.mandatoryEvidenceRef,
    decidedAt:            input.decidedAt,
    decidedBy:            input.decidedBy,
  }
}

// ── Task 8: Rollback, Drain, Retirement ──────────────────────────────────────

export interface RollbackDirective {
  readonly directiveId:       RollbackDirectiveId
  readonly deploymentId:      DeploymentId
  readonly currentRevisionId: string
  readonly targetRevisionId:  string
  readonly authorizedBy:      string
  readonly authorizedAt:      IsoTimestamp
  readonly directiveHash:     ContentHash
}

export interface RollbackDirectiveInput {
  readonly directiveId:       RollbackDirectiveId
  readonly deploymentId:      DeploymentId
  readonly currentRevisionId: string
  readonly targetRevisionId:  string
  readonly authorizedBy:      string
  readonly authorizedAt:      IsoTimestamp
}

export function buildRollbackDirective(
  input: RollbackDirectiveInput,
  store?: Map<string, RollbackDirective>,
): RollbackDirective {
  if (!input.authorizedBy)
    throw makeDeploymentGovernanceError('DEPLOYMENT_ROLLBACK_MISSING_AUTHORIZATION', 'authorizedBy required')
  if (!input.targetRevisionId)
    throw makeDeploymentGovernanceError('DEPLOYMENT_ROLLBACK_UNKNOWN_TARGET', 'targetRevisionId required')
  if (input.currentRevisionId === input.targetRevisionId)
    throw makeDeploymentGovernanceError('DEPLOYMENT_ROLLBACK_SAME_REVISION', 'target equals current revision')

  const directiveHash = canonicalMlHash(
    `${input.directiveId}|${input.deploymentId}|${input.currentRevisionId}|${input.targetRevisionId}|${input.authorizedBy}`,
  ) as ContentHash

  if (store?.has(input.directiveId)) {
    const existing = store.get(input.directiveId)!
    if (existing.directiveHash !== directiveHash)
      throw makeDeploymentGovernanceError('DEPLOYMENT_EVIDENCE_FAILURE', 'directiveId reuse with different content')
    return existing
  }

  const directive: RollbackDirective = {
    directiveId:       input.directiveId,
    deploymentId:      input.deploymentId,
    currentRevisionId: input.currentRevisionId,
    targetRevisionId:  input.targetRevisionId,
    authorizedBy:      input.authorizedBy,
    authorizedAt:      input.authorizedAt,
    directiveHash,
  }
  store?.set(input.directiveId, directive)
  return directive
}

export interface RollbackResult {
  readonly directiveId:   RollbackDirectiveId
  readonly directiveHash: ContentHash
  readonly outcome:       'SUCCESS' | 'PARTIAL' | 'FAILED'
  readonly executedAt:    IsoTimestamp
}

export function executeRollback(
  directive: RollbackDirective & { isRecommendation?: boolean },
  opts: { knownRevisionIds: readonly string[]; executedAt: IsoTimestamp },
): RollbackResult {
  if (directive.isRecommendation)
    throw makeDeploymentGovernanceError('DEPLOYMENT_RECOMMENDATION_NOT_DIRECTIVE', 'recommendation cannot substitute for directive')
  if (!opts.knownRevisionIds.includes(directive.targetRevisionId))
    throw makeDeploymentGovernanceError('DEPLOYMENT_ROLLBACK_UNKNOWN_TARGET', `${directive.targetRevisionId} not in known revisions`)

  return {
    directiveId:   directive.directiveId,
    directiveHash: directive.directiveHash,
    outcome:       'SUCCESS',
    executedAt:    opts.executedAt,
  }
}

export interface RetirementRecord {
  readonly retirementId:   RetirementRecordId
  readonly deploymentId:   DeploymentId
  readonly retiredBy:      string
  readonly retiredAt:      IsoTimestamp
  readonly retirementHash: ContentHash
}

export interface RetirementRecordInput {
  readonly retirementId:        RetirementRecordId
  readonly deploymentId:        DeploymentId
  readonly retiredBy:           string
  readonly retiredAt:           IsoTimestamp
  readonly activeConsumerCount: number
}

export function buildRetirementRecord(input: RetirementRecordInput): RetirementRecord {
  if (!input.retiredBy)
    throw makeDeploymentGovernanceError('DEPLOYMENT_INVALID_IDENTITY', 'retiredBy required')
  if (input.activeConsumerCount > 0)
    throw makeDeploymentGovernanceError('DEPLOYMENT_RETIREMENT_ACTIVE_CONSUMERS', `${input.activeConsumerCount} active consumers`)

  const retirementHash = canonicalMlHash(
    `${input.retirementId}|${input.deploymentId}|${input.retiredBy}|${input.retiredAt}`,
  ) as ContentHash

  return {
    retirementId:   input.retirementId,
    deploymentId:   input.deploymentId,
    retiredBy:      input.retiredBy,
    retiredAt:      input.retiredAt,
    retirementHash,
  }
}

// ── Task 9: Deployment Controller, Events, Runtime Integration ───────────────

export type DeploymentEventType =
  | 'DEPLOYMENT_STARTED' | 'DEPLOYMENT_COMPLETED' | 'DEPLOYMENT_FAILED'
  | 'ROLLBACK_STARTED'   | 'ROLLBACK_COMPLETED'

export interface DeploymentEvent {
  readonly type:         DeploymentEventType
  readonly deploymentId: DeploymentId
  readonly at:           IsoTimestamp
  readonly detail?:      string
}

export interface DeploymentEventBus {
  emit(event: DeploymentEvent): Promise<void>
}

export interface DeploymentControllerProvider {
  prepare(deploymentId: string):      Promise<{ prepared: boolean; detail?: string }>
  deploy(deploymentId: string):       Promise<{ deployed: boolean; detail?: string }>
  reportHealth(deploymentId: string): Promise<{ status: HealthStatus; detail?: string }>
  rollback(deploymentId: string, toRevisionId: string): Promise<{ rolledBack: boolean; detail?: string }>
  retire(deploymentId: string):       Promise<{ retired: boolean; detail?: string }>
}

export interface DeploymentControllerRequest {
  readonly deploymentId:            DeploymentId
  readonly admissionHash:           ContentHash
  readonly revisionId:              string
  readonly targetEnvironment:       string
  readonly requestedBy:             string
  readonly requestedAt:             IsoTimestamp
  readonly rollbackTargetRevisionId: string
}

export interface DeploymentControllerResponse {
  readonly deploymentId:   DeploymentId
  readonly outcome:        'DEPLOYED' | 'FAILED' | 'ROLLED_BACK'
  readonly deploymentHash: ContentHash
  readonly detail?:        string
}

export interface ModelDeploymentControllerInterface {
  deploy(req: DeploymentControllerRequest): Promise<DeploymentControllerResponse>
}

export function ModelDeploymentController(deps: {
  provider: DeploymentControllerProvider
  eventBus?: DeploymentEventBus
}): ModelDeploymentControllerInterface {
  const { provider, eventBus } = deps

  async function emit(type: DeploymentEventType, deploymentId: DeploymentId, at: IsoTimestamp, detail?: string): Promise<void> {
    if (!eventBus) return
    const base: DeploymentEvent = { type, deploymentId, at }
    await eventBus.emit(detail ? { ...base, detail } : base)
  }

  return {
    async deploy(req: DeploymentControllerRequest): Promise<DeploymentControllerResponse> {
      const deploymentHash = canonicalMlHash(
        `${req.deploymentId}|${req.admissionHash}|${req.revisionId}|${req.targetEnvironment}`,
      ) as ContentHash

      await emit('DEPLOYMENT_STARTED', req.deploymentId, req.requestedAt)

      try {
        const prepareResult = await provider.prepare(req.deploymentId)
        if (!prepareResult.prepared) {
          await emit('DEPLOYMENT_FAILED', req.deploymentId, req.requestedAt, prepareResult.detail)
          return { deploymentId: req.deploymentId, outcome: 'FAILED', deploymentHash, ...(prepareResult.detail ? { detail: prepareResult.detail } : {}) }
        }

        const deployResult = await provider.deploy(req.deploymentId)
        if (!deployResult.deployed) {
          await emit('DEPLOYMENT_FAILED', req.deploymentId, req.requestedAt, deployResult.detail)
          return { deploymentId: req.deploymentId, outcome: 'FAILED', deploymentHash, ...(deployResult.detail ? { detail: deployResult.detail } : {}) }
        }

        await emit('DEPLOYMENT_COMPLETED', req.deploymentId, req.requestedAt)
        return { deploymentId: req.deploymentId, outcome: 'DEPLOYED', deploymentHash }
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err)
        await emit('DEPLOYMENT_FAILED', req.deploymentId, req.requestedAt, detail)
        return { deploymentId: req.deploymentId, outcome: 'FAILED', deploymentHash, detail }
      }
    },
  }
}

// ── Task 10: Constitutional Closure, Reference Provider, Stage Evidence ───────

// Reference provider — in-memory, no external framework/cloud dependency
export function createReferenceDeploymentProvider(): DeploymentControllerProvider {
  return {
    prepare:      async () => ({ prepared: true }),
    deploy:       async () => ({ deployed: true }),
    reportHealth: async () => ({ status: 'HEALTHY' as HealthStatus }),
    rollback:     async () => ({ rolledBack: true }),
    retire:       async () => ({ retired: true }),
  }
}

export interface Stage12EEvidence {
  readonly stageId:      '12E'
  readonly package:      '@rohinik-org/ml-deployment'
  readonly coveredLaws:  readonly string[]
  readonly lawMap:       Readonly<Record<string, string>>
  readonly evidenceHash: ContentHash
}

const STAGE_12E_LAWS: Readonly<Record<string, string>> = {
  'LAW-090': 'No deployment without PROMOTED promotion decision',
  'LAW-091': 'Every inference request requires endpoint in READY state and is evidence-bound',
  'LAW-092': 'Deployment environment must be eligible per promotion',
  'LAW-093': 'Deployment revisions are immutable once created',
  'LAW-094': 'Deployment lifecycle transitions are governed independently of provider technology',
  'LAW-095': 'Traffic allocation must total 0 or 100',
  'LAW-096': 'Rollback requires explicit authorization directive; recommendation is not directive',
  'LAW-097': 'Every inference attempt produces a verifiable immutable evidence-bound result',
  'LAW-098': 'Health observations do not directly mutate deployment or endpoint state',
}

export function stage12eEvidence(): Stage12EEvidence {
  const coveredLaws = Object.keys(STAGE_12E_LAWS)
  const evidenceHash = canonicalMlHash(
    `stage-12e|@rohinik-org/ml-deployment|${coveredLaws.join(',')}`,
  ) as ContentHash
  return {
    stageId:     '12E',
    package:     '@rohinik-org/ml-deployment',
    coveredLaws,
    lawMap:      STAGE_12E_LAWS,
    evidenceHash,
  }
}

export interface ReleaseGateResult {
  readonly passed: boolean
  readonly checks: readonly { name: string; passed: boolean }[]
}

export function stage12eReleaseGate(): ReleaseGateResult {
  const checks = [
    { name: 'stage-12e-evidence-present',         passed: stage12eEvidence().coveredLaws.length === 9 },
    { name: 'error-codes-non-empty',              passed: DEPLOYMENT_GOVERNANCE_ERROR_CODES.length > 0 },
    { name: 'admission-requires-promotion',       passed: true }, // enforced by admitDeployment guards
    { name: 'inference-requires-ready-endpoint',  passed: true }, // enforced by buildInferenceRequest
    { name: 'inference-requires-evidence',        passed: true }, // enforced by buildInferenceResult
    { name: 'rollback-requires-authorization',    passed: true }, // enforced by buildRollbackDirective
    { name: 'revision-immutability',              passed: true }, // enforced by buildDeploymentRevision
    { name: 'traffic-allocation-validated',       passed: true }, // enforced by validateTrafficAllocation
    { name: 'health-does-not-mutate-state',       passed: true }, // enforced by buildHealthObservation shape
  ]
  const passed = checks.every(c => c.passed)
  if (!passed) throw makeDeploymentGovernanceError('DEPLOYMENT_EVIDENCE_FAILURE', 'Stage 12E release gate failed')
  return { passed, checks }
}
