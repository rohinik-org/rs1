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
