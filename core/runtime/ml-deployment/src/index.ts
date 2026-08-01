// @rohinik-org/ml-deployment — ports, error taxonomy, and provider contracts (Task 1)
// No framework/cloud deployment SDK dependencies. No drift/retraining symbols. No Stage 12F scaffolding.

export type {
  DeploymentId, EndpointId, InferenceRequestId, RollbackDirectiveId, RetirementRecordId,
  ContentHash, IsoTimestamp, ModelId, PromotionDecisionId, ProviderExtension, JsonValue,
} from '@rohinik-org/ml-ir'
export { canonicalMlHash } from '@rohinik-org/ml-ir'
import { canonicalMlHash } from '@rohinik-org/ml-ir'
import type { IsoTimestamp, ContentHash } from '@rohinik-org/ml-ir'

// Re-export PromotionDecision from 12D — deployment gate depends on it
export type { PromotionDecision } from '@rohinik-org/ml-evaluation'

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
