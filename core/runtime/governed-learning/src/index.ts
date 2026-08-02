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

// ── Task 2: Evidence Corpus and Opportunity Detection ─────────────────────────

export interface EvidenceRef {
  readonly evidenceId: string
  readonly evidenceHash: ContentHash
}

export interface ObservationPeriod {
  readonly startAt: IsoTimestamp
  readonly endAt: IsoTimestamp
}

export interface AdaptationEvidenceCorpusInput {
  readonly corpusId: string
  readonly scope: AdaptationKind
  readonly observationPeriod: ObservationPeriod
  readonly executionEvidenceRefs: readonly EvidenceRef[]
  readonly evaluationEvidenceRefs: readonly EvidenceRef[]
  readonly reliabilityEvidenceRefs: readonly EvidenceRef[]
  readonly routingEvidenceRefs: readonly EvidenceRef[]
  readonly economicsEvidenceRefs: readonly EvidenceRef[]
  readonly policyEvidenceRefs: readonly EvidenceRef[]
  readonly sealedAt: IsoTimestamp
  readonly sealedBy: string
  readonly vendorClaimsOnly?: boolean
  readonly selfEvidenceOnly?: boolean
  readonly stalenessThresholdMs?: number
}

export interface AdaptationEvidenceCorpus {
  readonly corpusId: string
  readonly scope: AdaptationKind
  readonly observationPeriod: ObservationPeriod
  readonly corpusHash: ContentHash
  readonly authoritative: boolean
  readonly sealedAt: IsoTimestamp
  readonly sealedBy: string
}

export function buildAdaptationEvidenceCorpus(
  input: AdaptationEvidenceCorpusInput,
  store?: Map<string, AdaptationEvidenceCorpus>,
): AdaptationEvidenceCorpus {
  if (!input.sealedAt) {
    throw makeGovernedLearningError('GOVERNED_LEARNING_MISSING_EVIDENCE', 'corpus must be sealed')
  }
  const totalRefs =
    input.executionEvidenceRefs.length +
    input.evaluationEvidenceRefs.length +
    input.reliabilityEvidenceRefs.length +
    input.routingEvidenceRefs.length +
    input.economicsEvidenceRefs.length +
    input.policyEvidenceRefs.length
  let authoritative = totalRefs > 0 && !input.vendorClaimsOnly && !input.selfEvidenceOnly
  if (authoritative && input.stalenessThresholdMs !== undefined) {
    const ageMs = Date.now() - new Date(input.observationPeriod.endAt).getTime()
    if (ageMs > input.stalenessThresholdMs) authoritative = false
  }
  const corpusHash = canonicalMlHash({
    corpusId: input.corpusId,
    scope: input.scope,
    observationPeriod: input.observationPeriod,
    sealedAt: input.sealedAt,
    totalRefs,
  }) as ContentHash
  if (store) {
    const existing = store.get(input.corpusId)
    if (existing) {
      if (existing.scope !== input.scope) {
        throw makeGovernedLearningError('GOVERNED_LEARNING_CONTRADICTORY_EVIDENCE',
          `corpusId ${input.corpusId} already registered with different scope`)
      }
      return existing
    }
  }
  const record: AdaptationEvidenceCorpus = {
    corpusId: input.corpusId,
    scope: input.scope,
    observationPeriod: input.observationPeriod,
    corpusHash,
    authoritative,
    sealedAt: input.sealedAt,
    sealedBy: input.sealedBy,
  }
  store?.set(input.corpusId, record)
  return record
}

export interface AdaptationOpportunityInput {
  readonly opportunityId: string
  readonly corpusId: string
  readonly corpusHash: ContentHash
  readonly kind: AdaptationKind
  readonly rationale: string
  readonly detectedAt: IsoTimestamp
  readonly detectedBy: string
  readonly corpusAuthoritative?: boolean
}

export interface AdaptationOpportunity {
  readonly opportunityId: string
  readonly corpusId: string
  readonly corpusHash: ContentHash
  readonly kind: AdaptationKind
  readonly rationale: string
  readonly detectedAt: IsoTimestamp
  readonly detectedBy: string
  readonly opportunityHash: ContentHash
}

export function buildAdaptationOpportunity(input: AdaptationOpportunityInput): AdaptationOpportunity {
  if (input.corpusAuthoritative === false) {
    throw makeGovernedLearningError('GOVERNED_LEARNING_MISSING_EVIDENCE',
      'opportunity requires authoritative corpus')
  }
  const opportunityHash = canonicalMlHash({
    opportunityId: input.opportunityId,
    corpusId: input.corpusId,
    corpusHash: input.corpusHash,
    kind: input.kind,
    detectedAt: input.detectedAt,
  }) as ContentHash
  return {
    opportunityId: input.opportunityId,
    corpusId: input.corpusId,
    corpusHash: input.corpusHash,
    kind: input.kind,
    rationale: input.rationale,
    detectedAt: input.detectedAt,
    detectedBy: input.detectedBy,
    opportunityHash,
  }
}

// ── Task 3: Adaptation Proposal and Candidate Version ─────────────────────────

export interface AdaptationProposalInput {
  readonly proposalId: ProposalId
  readonly adaptationId: AdaptationId
  readonly opportunityId: string
  readonly opportunityHash: ContentHash
  readonly corpusId: string
  readonly corpusHash: ContentHash
  readonly kind: AdaptationKind
  readonly proposedBy: string
  readonly proposedAt: IsoTimestamp
  readonly evidenceRef: EvidenceRef
  readonly rationale: string
  readonly expectedBenefit: string
  readonly riskHypothesis: string
}

export interface AdaptationProposal {
  readonly proposalId: ProposalId
  readonly adaptationId: AdaptationId
  readonly kind: AdaptationKind
  readonly proposedBy: string
  readonly proposedAt: IsoTimestamp
  readonly proposalHash: ContentHash
  readonly rationale: string
  readonly expectedBenefit: string
  readonly riskHypothesis: string
}

export function buildAdaptationProposal(
  input: AdaptationProposalInput,
  store?: Map<string, AdaptationProposal>,
): AdaptationProposal {
  if (!ADAPTATION_KINDS.includes(input.kind as any)) {
    throw makeGovernedLearningError('GOVERNED_LEARNING_DIRECT_MUTATION',
      `kind ${input.kind} is not a valid adaptation kind — model-weight mutation forbidden`)
  }
  if (!input.corpusHash) {
    throw makeGovernedLearningError('GOVERNED_LEARNING_MISSING_EVIDENCE', 'corpusHash is required')
  }
  if (!input.opportunityHash) {
    throw makeGovernedLearningError('GOVERNED_LEARNING_MISSING_EVIDENCE', 'opportunityHash is required')
  }
  const proposalHash = canonicalMlHash({
    proposalId: input.proposalId,
    adaptationId: input.adaptationId,
    kind: input.kind,
    corpusHash: input.corpusHash,
    opportunityHash: input.opportunityHash,
    proposedAt: input.proposedAt,
  }) as ContentHash
  if (store) {
    const existing = store.get(input.proposalId)
    if (existing) {
      if (existing.kind !== input.kind) {
        throw makeGovernedLearningError('GOVERNED_LEARNING_INVALID_CANDIDATE',
          `proposalId ${input.proposalId} conflict: different kind`)
      }
      return existing
    }
  }
  const record: AdaptationProposal = {
    proposalId: input.proposalId,
    adaptationId: input.adaptationId,
    kind: input.kind,
    proposedBy: input.proposedBy,
    proposedAt: input.proposedAt,
    proposalHash,
    rationale: input.rationale,
    expectedBenefit: input.expectedBenefit,
    riskHypothesis: input.riskHypothesis,
  }
  store?.set(input.proposalId, record)
  return record
}

export interface RollbackProjection {
  readonly targetVersionId: AdaptationVersionId
}

export interface AdaptationCandidateVersionInput {
  readonly versionId: AdaptationVersionId
  readonly proposalId: ProposalId
  readonly proposalHash: ContentHash
  readonly adaptationId: AdaptationId
  readonly kind: AdaptationKind
  readonly candidateConfiguration: Record<string, unknown>
  readonly protectedInvariants: readonly string[]
  readonly rollbackProjection: RollbackProjection
  readonly createdAt: IsoTimestamp
  readonly createdBy: string
}

export interface AdaptationCandidateVersion {
  readonly versionId: AdaptationVersionId
  readonly proposalId: ProposalId
  readonly adaptationId: AdaptationId
  readonly kind: AdaptationKind
  readonly candidateConfiguration: Record<string, unknown>
  readonly protectedInvariants: readonly string[]
  readonly rollbackProjection: RollbackProjection
  readonly versionHash: ContentHash
  readonly createdAt: IsoTimestamp
  readonly createdBy: string
}

export function buildAdaptationCandidateVersion(
  input: AdaptationCandidateVersionInput,
): AdaptationCandidateVersion {
  if (!input.proposalHash) {
    throw makeGovernedLearningError('GOVERNED_LEARNING_MISSING_EVIDENCE', 'proposalHash is required')
  }
  if (!input.rollbackProjection) {
    throw makeGovernedLearningError('GOVERNED_LEARNING_ROLLBACK_UNAVAILABLE',
      'rollbackProjection is required for all candidate versions')
  }
  const versionHash = canonicalMlHash({
    versionId: input.versionId,
    proposalId: input.proposalId,
    proposalHash: input.proposalHash,
    kind: input.kind,
    createdAt: input.createdAt,
  }) as ContentHash
  return {
    versionId: input.versionId,
    proposalId: input.proposalId,
    adaptationId: input.adaptationId,
    kind: input.kind,
    candidateConfiguration: input.candidateConfiguration,
    protectedInvariants: input.protectedInvariants,
    rollbackProjection: input.rollbackProjection,
    versionHash,
    createdAt: input.createdAt,
    createdBy: input.createdBy,
  }
}

// ── Task 4: Baseline Registry and Experiment Plan ─────────────────────────────

export interface AdaptationBaselineInput {
  readonly baselineId: BaselineId
  readonly adaptationId: AdaptationId
  readonly kind: AdaptationKind
  readonly baselineVersionId: AdaptationVersionId
  readonly candidateVersionId?: AdaptationVersionId
  readonly authorityRef: EvidenceRef
  readonly approvedAt: IsoTimestamp
  readonly approvedBy: string
  readonly stalenessThresholdMs?: number
}

export interface AdaptationBaseline {
  readonly baselineId: BaselineId
  readonly adaptationId: AdaptationId
  readonly kind: AdaptationKind
  readonly baselineVersionId: AdaptationVersionId
  readonly baselineHash: ContentHash
  readonly approvedAt: IsoTimestamp
  readonly approvedBy: string
}

export function buildAdaptationBaseline(
  input: AdaptationBaselineInput,
  store?: Map<string, AdaptationBaseline>,
): AdaptationBaseline {
  if (!input.authorityRef) {
    throw makeGovernedLearningError('GOVERNED_LEARNING_MISSING_EVIDENCE', 'authorityRef is required')
  }
  if (input.candidateVersionId && input.candidateVersionId === input.baselineVersionId) {
    throw makeGovernedLearningError('GOVERNED_LEARNING_SELF_EVIDENCE',
      'candidate cannot serve as its own baseline')
  }
  if (input.stalenessThresholdMs !== undefined) {
    const ageMs = Date.now() - new Date(input.approvedAt).getTime()
    if (ageMs > input.stalenessThresholdMs) {
      throw makeGovernedLearningError('GOVERNED_LEARNING_STALE_CORPUS',
        `baseline ${input.baselineId} is stale`)
    }
  }
  const baselineHash = canonicalMlHash({
    baselineId: input.baselineId,
    adaptationId: input.adaptationId,
    kind: input.kind,
    baselineVersionId: input.baselineVersionId,
    authorityRef: input.authorityRef,
    approvedAt: input.approvedAt,
  }) as ContentHash
  if (store) {
    const existing = store.get(input.baselineId)
    if (existing) {
      if (existing.kind !== input.kind) {
        throw makeGovernedLearningError('GOVERNED_LEARNING_INVALID_CANDIDATE',
          `baselineId ${input.baselineId} conflict: different kind`)
      }
      return existing
    }
  }
  const record: AdaptationBaseline = {
    baselineId: input.baselineId,
    adaptationId: input.adaptationId,
    kind: input.kind,
    baselineVersionId: input.baselineVersionId,
    baselineHash,
    approvedAt: input.approvedAt,
    approvedBy: input.approvedBy,
  }
  store?.set(input.baselineId, record)
  return record
}

export interface AdaptationExperimentPlanInput {
  readonly planId: AdaptationId  // ponytail: reuse branded string type
  readonly adaptationId: AdaptationId
  readonly proposalId: ProposalId
  readonly proposalHash: ContentHash
  readonly baselineId: BaselineId
  readonly baselineHash: ContentHash
  readonly primaryMetrics: readonly string[]
  readonly guardrailMetrics: readonly string[]
  readonly rollbackCriteria: Record<string, unknown>
  readonly populationPlan: Record<string, unknown>
  readonly minDurationMs: number
  readonly minSampleCount: number
  readonly createdAt: IsoTimestamp
  readonly createdBy: string
}

export interface AdaptationExperimentPlan {
  readonly planId: AdaptationId
  readonly adaptationId: AdaptationId
  readonly proposalId: ProposalId
  readonly baselineId: BaselineId
  readonly primaryMetrics: readonly string[]
  readonly guardrailMetrics: readonly string[]
  readonly rollbackCriteria: Record<string, unknown>
  readonly populationPlan: Record<string, unknown>
  readonly minDurationMs: number
  readonly minSampleCount: number
  readonly planHash: ContentHash
  readonly createdAt: IsoTimestamp
  readonly createdBy: string
}

export function buildAdaptationExperimentPlan(
  input: AdaptationExperimentPlanInput,
): AdaptationExperimentPlan {
  if (!input.baselineHash) {
    throw makeGovernedLearningError('GOVERNED_LEARNING_MISSING_BASELINE', 'baselineHash is required')
  }
  if (!input.rollbackCriteria) {
    throw makeGovernedLearningError('GOVERNED_LEARNING_ROLLBACK_UNAVAILABLE',
      'rollbackCriteria required — plan cannot be created without rollback conditions')
  }
  const planHash = canonicalMlHash({
    planId: input.planId,
    adaptationId: input.adaptationId,
    proposalHash: input.proposalHash,
    baselineHash: input.baselineHash,
    primaryMetrics: input.primaryMetrics,
    createdAt: input.createdAt,
  }) as ContentHash
  return {
    planId: input.planId,
    adaptationId: input.adaptationId,
    proposalId: input.proposalId,
    baselineId: input.baselineId,
    primaryMetrics: input.primaryMetrics,
    guardrailMetrics: input.guardrailMetrics,
    rollbackCriteria: input.rollbackCriteria,
    populationPlan: input.populationPlan,
    minDurationMs: input.minDurationMs,
    minSampleCount: input.minSampleCount,
    planHash,
    createdAt: input.createdAt,
    createdBy: input.createdBy,
  }
}
