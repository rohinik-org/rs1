import { canonicalMlHash } from '@rohinik-org/ml-ir'
import type {
  DeploymentId,
  ModelId,
  DriftSignalId,
  RetirementRecordId,
  IsoTimestamp,
  ContentHash,
  DriftType,
  DriftSeverity,
  DriftSignal,
  DriftAssessment,
  OperationalRecommendation,
  ModelRetirementRecord,
  ModelSupersession,
  ObservationWindow,
} from '@rohinik-org/ml-ir'

// ── Error taxonomy ────────────────────────────────────────────────────────────

export const OPERATIONS_GOVERNANCE_ERROR_CODES = {
  OPERATIONS_MISSING_EVIDENCE:                'OPERATIONS_MISSING_EVIDENCE',
  OPERATIONS_MISSING_BASELINE:                'OPERATIONS_MISSING_BASELINE',
  OPERATIONS_MISSING_OBSERVATION_WINDOW:      'OPERATIONS_MISSING_OBSERVATION_WINDOW',
  OPERATIONS_DRIFT_PROVIDER_BOUNDARY_VIOLATION: 'OPERATIONS_DRIFT_PROVIDER_BOUNDARY_VIOLATION',
  OPERATIONS_RECOMMENDATION_NOT_EXECUTABLE:   'OPERATIONS_RECOMMENDATION_NOT_EXECUTABLE',
  OPERATIONS_RETIREMENT_ACTIVE_DEPLOYMENT:    'OPERATIONS_RETIREMENT_ACTIVE_DEPLOYMENT',
  OPERATIONS_INVALID_CONFIDENCE:              'OPERATIONS_INVALID_CONFIDENCE',
  OPERATIONS_WINDOW_INVALID:                  'OPERATIONS_WINDOW_INVALID',
  OPERATIONS_MISSING_DRIFT_SIGNAL:            'OPERATIONS_MISSING_DRIFT_SIGNAL',
  OPERATIONS_ASSESSMENT_NOT_FOUND:            'OPERATIONS_ASSESSMENT_NOT_FOUND',
  OPERATIONS_RETIREMENT_MISSING_IMPACT:       'OPERATIONS_RETIREMENT_MISSING_IMPACT',
  OPERATIONS_SUPERSESSION_CONFLICT:           'OPERATIONS_SUPERSESSION_CONFLICT',
  OPERATIONS_CROSS_STAGE_REQUEST_INVALID:     'OPERATIONS_CROSS_STAGE_REQUEST_INVALID',
} as const

export type OperationsGovernanceErrorCode = keyof typeof OPERATIONS_GOVERNANCE_ERROR_CODES

export class OperationsGovernanceError extends Error {
  override readonly name = 'OPERATIONS_GOVERNANCE_ERROR'
  constructor(
    public readonly code: OperationsGovernanceErrorCode,
    message: string,
  ) {
    super(`${code}: ${message}`)
  }
}

export function makeOperationsGovernanceError(
  code: OperationsGovernanceErrorCode,
  message: string,
): OperationsGovernanceError {
  return new OperationsGovernanceError(code, message)
}

// ── OperationsGovernanceContext ───────────────────────────────────────────────

export interface PolicyRef {
  readonly policyId: string
  readonly policyHash: ContentHash
}

export interface EvidenceRef {
  readonly evidenceId: string
  readonly evidenceHash: ContentHash
}

export interface OperationsGovernanceContext {
  readonly deploymentId: DeploymentId
  readonly modelId: ModelId
  readonly policyRef: PolicyRef
  readonly evidenceRef: EvidenceRef
  readonly evaluatedAt: IsoTimestamp
}

// ── Observation window record ─────────────────────────────────────────────────

export interface ObservationWindowRecord {
  readonly windowId: string
  readonly deploymentId: DeploymentId
  readonly window: ObservationWindow
  readonly createdAt: IsoTimestamp
  readonly createdBy: string
}

// ── Drift baseline record ─────────────────────────────────────────────────────

export interface DriftBaselineRecord {
  readonly baselineId: string
  readonly deploymentId: DeploymentId
  readonly driftType: DriftType
  readonly window: ObservationWindow
  readonly baselineHash: ContentHash
  readonly createdAt: IsoTimestamp
  readonly createdBy: string
}

// ── Cross-stage request ───────────────────────────────────────────────────────

export type CrossStageRequestKind = 'RETRAINING' | 'ROLLBACK_RECOMMENDATION' | 'REVIEW'

export interface CrossStageRequest {
  readonly requestId: string
  readonly kind: CrossStageRequestKind
  readonly deploymentId: DeploymentId
  readonly modelId: ModelId
  readonly driftSignalId: DriftSignalId
  readonly evidenceRef: EvidenceRef
  readonly requestedAt: IsoTimestamp
  readonly requestedBy: string
  readonly rationale: string
}

// ── Provider boundary ─────────────────────────────────────────────────────────

export interface DriftStatisticsInput {
  readonly deploymentId: DeploymentId
  readonly driftType: DriftType
  readonly baselineWindow: ObservationWindow
  readonly observationWindow: ObservationWindow
  readonly baselineHash: ContentHash
  readonly evidenceRef: EvidenceRef
}

export interface DriftStatisticsOutput {
  readonly driftDetected: boolean
  readonly statisticsHash: ContentHash
  readonly severity?: DriftSeverity
  readonly confidenceScore?: number
  readonly detail?: string
}

export interface DriftProviderAdapter {
  computeDriftStatistics(input: DriftStatisticsInput): Promise<DriftStatisticsOutput>
}

// ── Repository ports ──────────────────────────────────────────────────────────

export interface ObservationWindowRepository {
  save(record: ObservationWindowRecord): Promise<void>
  find(windowId: string): Promise<ObservationWindowRecord | undefined>
  list(deploymentId: DeploymentId): Promise<readonly ObservationWindowRecord[]>
}

export interface DriftBaselineRepository {
  save(record: DriftBaselineRecord): Promise<void>
  find(baselineId: string): Promise<DriftBaselineRecord | undefined>
  findLatest(deploymentId: DeploymentId, driftType: DriftType): Promise<DriftBaselineRecord | undefined>
}

export interface DriftSignalRepository {
  save(signal: DriftSignal): Promise<void>
  find(signalId: DriftSignalId): Promise<DriftSignal | undefined>
  list(deploymentId: DeploymentId): Promise<readonly DriftSignal[]>
}

export interface DriftAssessmentRepository {
  save(assessment: DriftAssessment): Promise<void>
  find(assessmentId: string): Promise<DriftAssessment | undefined>
  list(signalId: DriftSignalId): Promise<readonly DriftAssessment[]>
}

export interface OperationalRecommendationRepository {
  save(recommendation: OperationalRecommendation): Promise<void>
  find(recommendationId: string): Promise<OperationalRecommendation | undefined>
  list(deploymentId: DeploymentId): Promise<readonly OperationalRecommendation[]>
}

export interface CrossStageRequestRepository {
  save(request: CrossStageRequest): Promise<void>
  find(requestId: string): Promise<CrossStageRequest | undefined>
  list(deploymentId: DeploymentId): Promise<readonly CrossStageRequest[]>
}

export interface ModelRetirementRepository {
  save(record: ModelRetirementRecord): Promise<void>
  find(retirementRecordId: RetirementRecordId): Promise<ModelRetirementRecord | undefined>
  list(modelId: ModelId): Promise<readonly ModelRetirementRecord[]>
}

export interface ModelSupersessionRepository {
  save(supersession: ModelSupersession): Promise<void>
  find(modelId: ModelId): Promise<ModelSupersession | undefined>
}

// ── Injected utilities ────────────────────────────────────────────────────────

export interface OperationsClock {
  now(): IsoTimestamp
}

export interface OperationsIdGenerator {
  nextId(): string
}

// ── Service deps and skeleton ─────────────────────────────────────────────────

export interface ModelOperationsGovernanceServiceDeps {
  readonly windowRepository: ObservationWindowRepository
  readonly baselineRepository: DriftBaselineRepository
  readonly signalRepository: DriftSignalRepository
  readonly assessmentRepository: DriftAssessmentRepository
  readonly recommendationRepository: OperationalRecommendationRepository
  readonly crossStageRequestRepository: CrossStageRequestRepository
  readonly retirementRepository: ModelRetirementRepository
  readonly supersessionRepository: ModelSupersessionRepository
  readonly driftProvider: DriftProviderAdapter
  readonly clock: OperationsClock
  readonly idGenerator: OperationsIdGenerator
}

export interface ModelOperationsGovernanceServiceInterface {
  // populated by Tasks 2–9
}

export function ModelOperationsGovernanceService(
  deps: ModelOperationsGovernanceServiceDeps,
): ModelOperationsGovernanceServiceInterface {
  void deps // ponytail: stub — Tasks 2–9 fill the implementation
  return {}
}

// ── Re-export ml-ir drift/operations types needed by Tasks 2–9 ───────────────

export type {
  DriftType,
  DriftSeverity,
  DriftSignal,
  DriftAssessment,
  OperationalRecommendation,
  ModelRetirementRecord,
  ModelSupersession,
  ObservationWindow,
  OperationalRecommendationType,
  AssessmentConfidence,
} from '@rohinik-org/ml-ir'

export {
  isValidConfidence,
  isValidObservationWindow,
} from '@rohinik-org/ml-ir'

// ── Task 2: Observation Windows and Baselines ─────────────────────────────────

export interface ObservationWindowRecord {
  readonly windowId: string
  readonly deploymentId: DeploymentId
  readonly modelId: ModelId
  readonly window: ObservationWindow
  readonly windowHash: ContentHash
  readonly evidenceRef: EvidenceRef
  readonly createdAt: IsoTimestamp
  readonly createdBy: string
}

export interface WindowRecordInput {
  readonly windowId: string
  readonly deploymentId: DeploymentId
  readonly modelId: ModelId
  readonly window: ObservationWindow
  readonly evidenceRef: EvidenceRef
  readonly createdAt: IsoTimestamp
  readonly createdBy: string
}

export function validateObservationWindow(w: ObservationWindow): void {
  if (!w.startAt || !w.endAt || w.startAt >= w.endAt) {
    throw makeOperationsGovernanceError('OPERATIONS_WINDOW_INVALID',
      `window must have startAt < endAt, got startAt=${w.startAt} endAt=${w.endAt}`)
  }
}

export function buildWindowRecord(
  input: WindowRecordInput,
  store?: Map<string, ObservationWindowRecord>,
): ObservationWindowRecord {
  validateObservationWindow(input.window)
  if (!input.evidenceRef) {
    throw makeOperationsGovernanceError('OPERATIONS_MISSING_EVIDENCE', 'evidenceRef is required')
  }
  const windowHash = canonicalMlHash({
    windowId: input.windowId,
    deploymentId: input.deploymentId,
    window: input.window,
    evidenceRef: input.evidenceRef,
  }) as ContentHash
  if (store) {
    const existing = store.get(input.windowId)
    if (existing) {
      if (existing.windowHash !== windowHash) {
        throw makeOperationsGovernanceError('OPERATIONS_WINDOW_INVALID',
          `windowId ${input.windowId} already registered with different content`)
      }
      return existing
    }
  }
  const record: ObservationWindowRecord = {
    windowId: input.windowId,
    deploymentId: input.deploymentId,
    modelId: input.modelId,
    window: input.window,
    windowHash,
    evidenceRef: input.evidenceRef,
    createdAt: input.createdAt,
    createdBy: input.createdBy,
  }
  store?.set(input.windowId, record)
  return record
}

export interface DriftBaselineRecord {
  readonly baselineId: string
  readonly deploymentId: DeploymentId
  readonly modelId: ModelId
  readonly driftType: DriftType
  readonly window: ObservationWindow
  readonly contentHash: ContentHash
  readonly baselineHash: ContentHash
  readonly evidenceRef: EvidenceRef
  readonly createdAt: IsoTimestamp
  readonly createdBy: string
}

export interface BaselineRecordInput {
  readonly baselineId: string
  readonly deploymentId: DeploymentId
  readonly modelId: ModelId
  readonly driftType: DriftType
  readonly window: ObservationWindow
  readonly contentHash: ContentHash
  readonly evidenceRef: EvidenceRef
  readonly createdAt: IsoTimestamp
  readonly createdBy: string
}

export function buildBaselineRecord(
  input: BaselineRecordInput,
  store?: Map<string, DriftBaselineRecord>,
): DriftBaselineRecord {
  if (!input.evidenceRef) {
    throw makeOperationsGovernanceError('OPERATIONS_MISSING_EVIDENCE', 'evidenceRef is required')
  }
  validateObservationWindow(input.window)
  const baselineHash = canonicalMlHash({
    baselineId: input.baselineId,
    deploymentId: input.deploymentId,
    driftType: input.driftType,
    window: input.window,
    contentHash: input.contentHash,
    evidenceRef: input.evidenceRef,
  }) as ContentHash
  if (store) {
    const existing = store.get(input.baselineId)
    if (existing) return existing
  }
  const record: DriftBaselineRecord = {
    baselineId: input.baselineId,
    deploymentId: input.deploymentId,
    modelId: input.modelId,
    driftType: input.driftType,
    window: input.window,
    contentHash: input.contentHash,
    baselineHash,
    evidenceRef: input.evidenceRef,
    createdAt: input.createdAt,
    createdBy: input.createdBy,
  }
  store?.set(input.baselineId, record)
  return record
}

// ── Task 3: Drift Signal Registry ─────────────────────────────────────────────

export interface DriftSignalRecord {
  readonly signalId: DriftSignalId
  readonly deploymentId: DeploymentId
  readonly driftType: DriftType
  readonly baselineWindowId: string
  readonly observationWindowId: string
  readonly baselineHash: ContentHash
  readonly signalHash: ContentHash
  readonly evidenceRef: EvidenceRef
  readonly registeredAt: IsoTimestamp
  readonly registeredBy: string
}

export interface DriftSignalRecordInput {
  readonly signalId: DriftSignalId
  readonly deploymentId: DeploymentId
  readonly driftType: DriftType
  readonly baselineWindowId: string
  readonly observationWindowId: string
  readonly baselineHash: ContentHash
  readonly evidenceRef: EvidenceRef
  readonly registeredAt: IsoTimestamp
  readonly registeredBy: string
}

export function buildDriftSignalRecord(
  input: DriftSignalRecordInput,
  store?: Map<string, DriftSignalRecord>,
): DriftSignalRecord {
  if (!input.evidenceRef) {
    throw makeOperationsGovernanceError('OPERATIONS_MISSING_EVIDENCE', 'evidenceRef is required')
  }
  if (!input.baselineHash) {
    throw makeOperationsGovernanceError('OPERATIONS_MISSING_BASELINE', 'baselineHash is required')
  }
  const signalHash = canonicalMlHash({
    signalId: input.signalId,
    deploymentId: input.deploymentId,
    driftType: input.driftType,
    baselineWindowId: input.baselineWindowId,
    observationWindowId: input.observationWindowId,
    baselineHash: input.baselineHash,
    evidenceRef: input.evidenceRef,
  }) as ContentHash
  if (store) {
    const existing = store.get(input.signalId)
    if (existing) {
      if (existing.signalHash !== signalHash) {
        throw makeOperationsGovernanceError('OPERATIONS_MISSING_DRIFT_SIGNAL',
          `signalId ${input.signalId} already registered with different content`)
      }
      return existing
    }
  }
  const record: DriftSignalRecord = {
    signalId: input.signalId,
    deploymentId: input.deploymentId,
    driftType: input.driftType,
    baselineWindowId: input.baselineWindowId,
    observationWindowId: input.observationWindowId,
    baselineHash: input.baselineHash,
    signalHash,
    evidenceRef: input.evidenceRef,
    registeredAt: input.registeredAt,
    registeredBy: input.registeredBy,
  }
  store?.set(input.signalId, record)
  return record
}

// ── Task 8: Retirement, Supersession ─────────────────────────────────────────

export interface RetirementRequest {
  readonly requestId: string
  readonly modelId: ModelId
  readonly requestedBy: string
  readonly requestedAt: IsoTimestamp
  readonly rationale: string
  readonly evidenceRef: EvidenceRef
  readonly requestHash: ContentHash
}

export interface RetirementRequestInput {
  readonly requestId: string
  readonly modelId: ModelId
  readonly requestedBy: string
  readonly requestedAt: IsoTimestamp
  readonly rationale: string
  readonly evidenceRef: EvidenceRef
}

export function buildRetirementRequest(input: RetirementRequestInput): RetirementRequest {
  if (!input.evidenceRef) {
    throw makeOperationsGovernanceError('OPERATIONS_MISSING_EVIDENCE', 'evidenceRef is required')
  }
  if (!input.requestedBy) {
    throw makeOperationsGovernanceError('OPERATIONS_RETIREMENT_ACTIVE_DEPLOYMENT',
      'requestedBy is required')
  }
  const requestHash = canonicalMlHash({
    requestId: input.requestId,
    modelId: input.modelId,
    requestedBy: input.requestedBy,
    requestedAt: input.requestedAt,
    rationale: input.rationale,
    evidenceRef: input.evidenceRef,
  }) as ContentHash
  return { ...input, requestHash }
}

export type RetirementBlockerKind = 'ACTIVE_DEPLOYMENT' | 'ACTIVE_CONSUMER' | 'LEGAL_HOLD' | 'RETENTION_POLICY'

export interface RetirementBlocker {
  readonly kind: RetirementBlockerKind
  readonly detail?: string
}

export interface RetirementImpactAssessment {
  readonly modelId: ModelId
  readonly eligible: boolean
  readonly blockers: readonly RetirementBlocker[]
  readonly activeDeploymentIds: readonly DeploymentId[]
  readonly activeConsumerCount: number
}

export interface RetirementImpactInput {
  readonly modelId: ModelId
  readonly activeDeploymentIds: readonly DeploymentId[]
  readonly activeConsumerCount: number
  readonly legalHold?: boolean
  readonly retentionPolicyBlocks?: boolean
}

export function assessRetirementImpact(input: RetirementImpactInput): RetirementImpactAssessment {
  const blockers: RetirementBlocker[] = []
  if (input.activeDeploymentIds.length > 0) {
    blockers.push({ kind: 'ACTIVE_DEPLOYMENT', detail: `${input.activeDeploymentIds.length} active deployment(s)` })
  }
  if (input.activeConsumerCount > 0) {
    blockers.push({ kind: 'ACTIVE_CONSUMER', detail: `${input.activeConsumerCount} active consumer(s)` })
  }
  if (input.legalHold) {
    blockers.push({ kind: 'LEGAL_HOLD' })
  }
  if (input.retentionPolicyBlocks) {
    blockers.push({ kind: 'RETENTION_POLICY' })
  }
  return {
    modelId: input.modelId,
    eligible: blockers.length === 0,
    blockers,
    activeDeploymentIds: input.activeDeploymentIds,
    activeConsumerCount: input.activeConsumerCount,
  }
}

export type RetirementOutcome = 'APPROVED' | 'BLOCKED'

export interface RetirementDecision {
  readonly decisionId: RetirementRecordId
  readonly modelId: ModelId
  readonly outcome: RetirementOutcome
  readonly impact: RetirementImpactAssessment
  readonly decidedBy: string
  readonly decidedAt: IsoTimestamp
  readonly evidenceRef: EvidenceRef
  readonly decisionHash: ContentHash
}

export interface RetirementDecisionInput {
  readonly decisionId: RetirementRecordId
  readonly modelId: ModelId
  readonly impact: RetirementImpactAssessment
  readonly decidedBy: string
  readonly decidedAt: IsoTimestamp
  readonly evidenceRef: EvidenceRef
}

export function buildRetirementDecision(input: RetirementDecisionInput): RetirementDecision {
  if (!input.evidenceRef) {
    throw makeOperationsGovernanceError('OPERATIONS_MISSING_EVIDENCE', 'evidenceRef is required')
  }
  const outcome: RetirementOutcome = input.impact.eligible ? 'APPROVED' : 'BLOCKED'
  const decisionHash = canonicalMlHash({
    decisionId: input.decisionId,
    modelId: input.modelId,
    outcome,
    decidedBy: input.decidedBy,
    decidedAt: input.decidedAt,
    evidenceRef: input.evidenceRef,
  }) as ContentHash
  return {
    decisionId: input.decisionId,
    modelId: input.modelId,
    outcome,
    impact: input.impact,
    decidedBy: input.decidedBy,
    decidedAt: input.decidedAt,
    evidenceRef: input.evidenceRef,
    decisionHash,
  }
}

export interface ModelSupersessionRecord {
  readonly supersededModelId: ModelId
  readonly supersededByModelId: ModelId
  readonly supersededAt: IsoTimestamp
  readonly reason: string
  readonly supersededBy: string
  readonly evidenceRef: EvidenceRef
  readonly supersessionHash: ContentHash
}

export interface ModelSupersessionInput {
  readonly supersededModelId: ModelId
  readonly supersededByModelId: ModelId
  readonly supersededAt: IsoTimestamp
  readonly reason: string
  readonly supersededBy: string
  readonly evidenceRef: EvidenceRef
}

export function buildModelSupersession(input: ModelSupersessionInput): ModelSupersessionRecord {
  if (input.supersededModelId === input.supersededByModelId) {
    throw makeOperationsGovernanceError('OPERATIONS_SUPERSESSION_CONFLICT',
      'model cannot supersede itself')
  }
  const supersessionHash = canonicalMlHash({
    supersededModelId: input.supersededModelId,
    supersededByModelId: input.supersededByModelId,
    supersededAt: input.supersededAt,
    reason: input.reason,
    supersededBy: input.supersededBy,
    evidenceRef: input.evidenceRef,
  }) as ContentHash
  return { ...input, supersessionHash }
}

// ── Task 4: Drift Assessment ──────────────────────────────────────────────────

export type DriftAssessmentOutcome =
  | 'DRIFT_DETECTED'
  | 'NO_DRIFT'
  | 'INCONCLUSIVE'
  | 'NOT_EVALUATED'
  | 'CONTRADICTORY'

export interface DriftAssessmentRecord {
  readonly assessmentId: string
  readonly signalId: DriftSignalId
  readonly deploymentId: DeploymentId
  readonly driftType: DriftType
  readonly outcome: DriftAssessmentOutcome
  readonly confidenceScore?: number
  readonly statisticsHash?: ContentHash
  readonly evidenceRef: EvidenceRef
  readonly assessedAt: IsoTimestamp
  readonly assessedBy: string
  readonly assessmentHash: ContentHash
}

export interface DriftAssessmentInput {
  readonly assessmentId: string
  readonly signalId: DriftSignalId
  readonly deploymentId: DeploymentId
  readonly driftType: DriftType
  readonly outcome: DriftAssessmentOutcome
  readonly confidenceScore?: number
  readonly statisticsHash?: ContentHash
  readonly evidenceRef: EvidenceRef
  readonly assessedAt: IsoTimestamp
  readonly assessedBy: string
}

export function buildDriftAssessmentRecord(
  input: DriftAssessmentInput,
  store?: Map<string, DriftAssessmentRecord>,
): DriftAssessmentRecord {
  if (!input.evidenceRef) {
    throw makeOperationsGovernanceError('OPERATIONS_MISSING_EVIDENCE', 'evidenceRef is required')
  }
  if (input.confidenceScore !== undefined) {
    if (!Number.isFinite(input.confidenceScore) || input.confidenceScore < 0 || input.confidenceScore > 1) {
      throw makeOperationsGovernanceError('OPERATIONS_INVALID_CONFIDENCE',
        `confidenceScore must be in [0,1], got ${input.confidenceScore}`)
    }
  }
  const assessmentHash = canonicalMlHash({
    assessmentId: input.assessmentId,
    signalId: input.signalId,
    deploymentId: input.deploymentId,
    driftType: input.driftType,
    outcome: input.outcome,
    evidenceRef: input.evidenceRef,
    ...(input.statisticsHash ? { statisticsHash: input.statisticsHash } : {}),
    ...(input.confidenceScore !== undefined ? { confidenceScore: input.confidenceScore } : {}),
  }) as ContentHash
  if (store) {
    const existing = store.get(input.assessmentId)
    if (existing) {
      if (existing.assessmentHash !== assessmentHash) {
        throw makeOperationsGovernanceError('OPERATIONS_ASSESSMENT_NOT_FOUND',
          `assessmentId ${input.assessmentId} conflict: stored hash differs`)
      }
      return existing
    }
  }
  const record: DriftAssessmentRecord = {
    assessmentId: input.assessmentId,
    signalId: input.signalId,
    deploymentId: input.deploymentId,
    driftType: input.driftType,
    outcome: input.outcome,
    evidenceRef: input.evidenceRef,
    assessedAt: input.assessedAt,
    assessedBy: input.assessedBy,
    assessmentHash,
    ...(input.confidenceScore !== undefined ? { confidenceScore: input.confidenceScore } : {}),
    ...(input.statisticsHash ? { statisticsHash: input.statisticsHash } : {}),
  }
  store?.set(input.assessmentId, record)
  return record
}

// ── Task 5: Confidence, Severity, Contradiction, Disposition ─────────────────

export function normalizeConfidence(v: number): number {
  if (!Number.isFinite(v) || v < 0 || v > 1) {
    throw makeOperationsGovernanceError('OPERATIONS_INVALID_CONFIDENCE',
      `confidence must be finite in [0,1], got ${v}`)
  }
  return v
}

export type SeverityPolicy = { readonly lowConfidenceThreshold: number }
const DEFAULT_SEVERITY_POLICY: SeverityPolicy = { lowConfidenceThreshold: 0.5 }

export function deriveSeverity(input: {
  providerSeverity?: DriftSeverity
  confidence?: number
  policy?: SeverityPolicy
}): DriftSeverity {
  const { providerSeverity, confidence, policy = DEFAULT_SEVERITY_POLICY } = input
  if (!providerSeverity || confidence === undefined) return 'LOW'
  // ponytail: confidence caps severity — low confidence means uncertain, cap at LOW
  if (confidence < policy.lowConfidenceThreshold) return 'LOW'
  return providerSeverity
}

export type ContradictionResolutionKind = 'CONSISTENT' | 'CONTRADICTORY' | 'INCONCLUSIVE'

export interface ContradictionResolution {
  readonly resolution: ContradictionResolutionKind
  readonly requiresReview: boolean
  readonly fabricatedCertainty?: never
}

export function resolveContradiction(input: { outcomes: readonly DriftAssessmentOutcome[] }): ContradictionResolution {
  const set = new Set(input.outcomes)
  if (set.has('DRIFT_DETECTED') && set.has('NO_DRIFT')) {
    return { resolution: 'CONTRADICTORY', requiresReview: true }
  }
  if (set.size === 1 && set.has('INCONCLUSIVE')) {
    return { resolution: 'INCONCLUSIVE', requiresReview: false }
  }
  if (set.has('INCONCLUSIVE') || set.has('NOT_EVALUATED')) {
    return { resolution: 'INCONCLUSIVE', requiresReview: false }
  }
  return { resolution: 'CONSISTENT', requiresReview: false }
}

export type DispositionKind = 'CONFIRM' | 'DENY' | 'DEFER' | 'MANUAL_REVIEW'

export interface AssessmentDisposition {
  readonly signalId: DriftSignalId
  readonly disposition: DispositionKind
  readonly outcome: DriftAssessmentOutcome
  readonly contradiction: ContradictionResolution
  readonly summaryHash: ContentHash
  readonly evidenceRef: EvidenceRef
  readonly disposedAt: IsoTimestamp
}

export interface DispositionInput {
  readonly signalId: DriftSignalId
  readonly outcome: DriftAssessmentOutcome
  readonly confidence?: number
  readonly contradiction: ContradictionResolution
  readonly evidenceRef: EvidenceRef
  readonly disposedAt: IsoTimestamp
}

export function buildAssessmentDisposition(input: DispositionInput): AssessmentDisposition {
  if (!input.evidenceRef) {
    throw makeOperationsGovernanceError('OPERATIONS_MISSING_EVIDENCE', 'evidenceRef is required')
  }
  let disposition: DispositionKind
  if (input.contradiction.requiresReview || input.outcome === 'CONTRADICTORY') {
    disposition = 'MANUAL_REVIEW'
  } else if (input.outcome === 'DRIFT_DETECTED' && (input.confidence ?? 0) >= 0.5) {
    disposition = 'CONFIRM'
  } else if (input.outcome === 'NO_DRIFT') {
    disposition = 'DENY'
  } else {
    disposition = 'DEFER'
  }
  const summaryHash = canonicalMlHash({
    signalId: input.signalId,
    disposition,
    outcome: input.outcome,
    contradiction: input.contradiction.resolution,
    evidenceRef: input.evidenceRef,
    disposedAt: input.disposedAt,
  }) as ContentHash
  return {
    signalId: input.signalId,
    disposition,
    outcome: input.outcome,
    contradiction: input.contradiction,
    summaryHash,
    evidenceRef: input.evidenceRef,
    disposedAt: input.disposedAt,
  }
}
