import { canonicalMlHash } from '@rohinik-org/ml-ir'
import type { IsoTimestamp, ContentHash } from '@rohinik-org/ml-ir'

// ── Error taxonomy ────────────────────────────────────────────────────────────

export const GOVERNED_LEARNING_ERROR_CODES = {
  GOVERNED_LEARNING_MISSING_EVIDENCE:     'GOVERNED_LEARNING_MISSING_EVIDENCE',
  GOVERNED_LEARNING_MISSING_BASELINE:     'GOVERNED_LEARNING_MISSING_BASELINE',
  GOVERNED_LEARNING_SELF_EVALUATION:      'GOVERNED_LEARNING_SELF_EVALUATION',
  GOVERNED_LEARNING_SELF_EVIDENCE:        'GOVERNED_LEARNING_SELF_EVIDENCE',
  GOVERNED_LEARNING_ADMISSION_REQUIRED:   'GOVERNED_LEARNING_ADMISSION_REQUIRED',
  GOVERNED_LEARNING_EVALUATION_REQUIRED:  'GOVERNED_LEARNING_EVALUATION_REQUIRED',
  GOVERNED_LEARNING_DEPLOYMENT_REQUIRED:  'GOVERNED_LEARNING_DEPLOYMENT_REQUIRED',
  GOVERNED_LEARNING_OBSERVATION_REQUIRED: 'GOVERNED_LEARNING_OBSERVATION_REQUIRED',
  GOVERNED_LEARNING_ROLLBACK_UNAVAILABLE: 'GOVERNED_LEARNING_ROLLBACK_UNAVAILABLE',
  GOVERNED_LEARNING_SCOPE_EXPANSION:      'GOVERNED_LEARNING_SCOPE_EXPANSION',
  GOVERNED_LEARNING_DIRECT_MUTATION:      'GOVERNED_LEARNING_DIRECT_MUTATION',
  GOVERNED_LEARNING_VENDOR_AUTHORITY:     'GOVERNED_LEARNING_VENDOR_AUTHORITY',
  GOVERNED_LEARNING_TERMINAL_RECORD:      'GOVERNED_LEARNING_TERMINAL_RECORD',
  GOVERNED_LEARNING_OWNER_WRITE_FORBIDDEN: 'GOVERNED_LEARNING_OWNER_WRITE_FORBIDDEN',
  GOVERNED_LEARNING_INCOMPLETE_CORPUS:    'GOVERNED_LEARNING_INCOMPLETE_CORPUS',
  GOVERNED_LEARNING_STALE_CORPUS:         'GOVERNED_LEARNING_STALE_CORPUS',
  GOVERNED_LEARNING_CONTRADICTORY_EVIDENCE: 'GOVERNED_LEARNING_CONTRADICTORY_EVIDENCE',
  GOVERNED_LEARNING_INVALID_CANDIDATE:    'GOVERNED_LEARNING_INVALID_CANDIDATE',
  GOVERNED_LEARNING_PLAN_FROZEN:          'GOVERNED_LEARNING_PLAN_FROZEN',
} as const

export type GovernedLearningErrorCode = keyof typeof GOVERNED_LEARNING_ERROR_CODES

export class GovernedLearningError extends Error {
  override readonly name = 'GOVERNED_LEARNING_ERROR'
  constructor(
    public readonly code: GovernedLearningErrorCode,
    message: string,
  ) {
    super(`${code}: ${message}`)
  }
}

export function makeGovernedLearningError(
  code: GovernedLearningErrorCode,
  message: string,
): GovernedLearningError {
  return new GovernedLearningError(code, message)
}

// ── Branded IDs ───────────────────────────────────────────────────────────────

export type AdaptationId        = string & { readonly __brand: 'AdaptationId' }
export type AdaptationVersionId = string & { readonly __brand: 'AdaptationVersionId' }
export type ProposalId          = string & { readonly __brand: 'ProposalId' }
export type BaselineId          = string & { readonly __brand: 'BaselineId' }
export type EvaluationId        = string & { readonly __brand: 'EvaluationId' }
export type AdmissionId         = string & { readonly __brand: 'AdmissionId' }
export type DeploymentId        = string & { readonly __brand: 'DeploymentId' }
export type ObservationId       = string & { readonly __brand: 'ObservationId' }
export type RollbackId          = string & { readonly __brand: 'RollbackId' }
export type SupersessionId      = string & { readonly __brand: 'SupersessionId' }

// ── Adaptation kinds ──────────────────────────────────────────────────────────

export const ADAPTATION_KINDS = [
  'ROUTING_POLICY',
  'PLANNING_POLICY',
  'ECONOMICS_CALIBRATION',
  'RELIABILITY_WEIGHTING',
  'PROMPT_POLICY',
  'AGENT_POLICY',
  'EXECUTION_POLICY',
  'LEARNED_OPTIMISATION_METADATA',
] as const

export type AdaptationKind = typeof ADAPTATION_KINDS[number]

// ── Core record types (stubs — fleshed out in Tasks 2–9) ──────────────────────

export interface AdaptationRecord {
  readonly adaptationId: AdaptationId
  readonly kind: AdaptationKind
  readonly createdAt: IsoTimestamp
}

export interface AdaptationVersionRecord {
  readonly versionId: AdaptationVersionId
  readonly adaptationId: AdaptationId
  readonly versionHash: ContentHash
  readonly createdAt: IsoTimestamp
}

export interface ProposalRecord {
  readonly proposalId: ProposalId
  readonly adaptationId: AdaptationId
  readonly proposalHash: ContentHash
  readonly createdAt: IsoTimestamp
}

export interface BaselineRecord {
  readonly baselineId: BaselineId
  readonly adaptationId: AdaptationId
  readonly baselineHash: ContentHash
  readonly createdAt: IsoTimestamp
}

export interface EvaluationRecord {
  readonly evaluationId: EvaluationId
  readonly proposalId: ProposalId
  readonly evaluationHash: ContentHash
  readonly createdAt: IsoTimestamp
}

export interface AdmissionRecord {
  readonly admissionId: AdmissionId
  readonly proposalId: ProposalId
  readonly admissionHash: ContentHash
  readonly createdAt: IsoTimestamp
}

export interface DeploymentRecord {
  readonly deploymentId: DeploymentId
  readonly admissionId: AdmissionId
  readonly deploymentHash: ContentHash
  readonly createdAt: IsoTimestamp
}

export interface ObservationRecord {
  readonly observationId: ObservationId
  readonly deploymentId: DeploymentId
  readonly observationHash: ContentHash
  readonly createdAt: IsoTimestamp
}

export interface RollbackRecord {
  readonly rollbackId: RollbackId
  readonly deploymentId: DeploymentId
  readonly rollbackHash: ContentHash
  readonly createdAt: IsoTimestamp
}

export interface SupersessionRecord {
  readonly supersessionId: SupersessionId
  readonly supersededAdaptationId: AdaptationId
  readonly supersessionHash: ContentHash
  readonly createdAt: IsoTimestamp
}

// ── Repository ports ──────────────────────────────────────────────────────────

export interface AdaptationRepository {
  save(record: AdaptationRecord): Promise<void>
  find(id: AdaptationId): Promise<AdaptationRecord | undefined>
  list(kind?: AdaptationKind): Promise<readonly AdaptationRecord[]>
}

export interface AdaptationVersionRepository {
  save(record: AdaptationVersionRecord): Promise<void>
  find(id: AdaptationVersionId): Promise<AdaptationVersionRecord | undefined>
  list(adaptationId: AdaptationId): Promise<readonly AdaptationVersionRecord[]>
}

export interface ProposalRepository {
  save(record: ProposalRecord): Promise<void>
  find(id: ProposalId): Promise<ProposalRecord | undefined>
  list(adaptationId: AdaptationId): Promise<readonly ProposalRecord[]>
}

export interface BaselineRepository {
  save(record: BaselineRecord): Promise<void>
  find(id: BaselineId): Promise<BaselineRecord | undefined>
  list(adaptationId: AdaptationId): Promise<readonly BaselineRecord[]>
}

export interface EvaluationRepository {
  save(record: EvaluationRecord): Promise<void>
  find(id: EvaluationId): Promise<EvaluationRecord | undefined>
  list(proposalId: ProposalId): Promise<readonly EvaluationRecord[]>
}

export interface AdmissionRepository {
  save(record: AdmissionRecord): Promise<void>
  find(id: AdmissionId): Promise<AdmissionRecord | undefined>
  list(proposalId: ProposalId): Promise<readonly AdmissionRecord[]>
}

export interface DeploymentRepository {
  save(record: DeploymentRecord): Promise<void>
  find(id: DeploymentId): Promise<DeploymentRecord | undefined>
  list(admissionId: AdmissionId): Promise<readonly DeploymentRecord[]>
}

export interface ObservationRepository {
  save(record: ObservationRecord): Promise<void>
  find(id: ObservationId): Promise<ObservationRecord | undefined>
  list(deploymentId: DeploymentId): Promise<readonly ObservationRecord[]>
}

export interface RollbackRepository {
  save(record: RollbackRecord): Promise<void>
  find(id: RollbackId): Promise<RollbackRecord | undefined>
  list(deploymentId: DeploymentId): Promise<readonly RollbackRecord[]>
}

export interface SupersessionRepository {
  save(record: SupersessionRecord): Promise<void>
  find(id: SupersessionId): Promise<SupersessionRecord | undefined>
  list(adaptationId: AdaptationId): Promise<readonly SupersessionRecord[]>
}

// ── Cross-stage read-only ports ───────────────────────────────────────────────

export interface ExecutionEvidencePort {
  getEvidence(evidenceId: string): Promise<unknown>
}

export interface EvaluationEvidencePort {
  getEvaluationResult(evaluationResultId: string): Promise<unknown>
}

export interface ReliabilityEvidencePort {
  getReliabilityProfile(profileId: string): Promise<unknown>
}

export interface RoutingEvidencePort {
  getRoutingDecision(decisionId: string): Promise<unknown>
}

export interface EconomicsEvidencePort {
  getEconomicsEvidence(evidenceId: string): Promise<unknown>
}

export interface PolicyEvidencePort {
  getPolicyAdmission(admissionId: string): Promise<unknown>
}

// ── Owner-controller command port ─────────────────────────────────────────────

export interface OwnerCommandResult {
  readonly accepted: boolean
  readonly reason?: string
}

export interface OwnerControllerCommandPort {
  requestActivation(params: { adaptationVersionId: AdaptationVersionId; admissionId: AdmissionId }): Promise<OwnerCommandResult>
  requestRollback(params: { deploymentId: DeploymentId; rollbackId: RollbackId }): Promise<OwnerCommandResult>
}

// ── Utility ports ─────────────────────────────────────────────────────────────

export interface GovernedLearningClock {
  now(): IsoTimestamp
}

export interface GovernedLearningIdGenerator {
  nextId(): string
}

export interface GovernedLearningHasher {
  hash(value: unknown): ContentHash
}

// ── Canonical hasher (default implementation using ml-ir) ─────────────────────

export function makeCanonicalHasher(): GovernedLearningHasher {
  return { hash: (v) => canonicalMlHash(v) as ContentHash }
}
