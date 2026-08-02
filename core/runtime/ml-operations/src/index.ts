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
