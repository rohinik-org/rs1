import type {
  ObservedOutcome,
  PredictionComparison,
  PlanningComparison,
  ExecutionComparison,
  EvaluationScores,
  EvaluationExplanation,
  EvaluationRecord,
  EvaluationRequest,
} from '@rohinik-org/evaluation-ir'
import type { WorkingContextIR } from '@rohinik-org/working-context'

export type {
  ObservedOutcome,
  PredictionComparison,
  PlanningComparison,
  ExecutionComparison,
  EvaluationScores,
  EvaluationExplanation,
  EvaluationRecord,
  EvaluationRequest,
  WorkingContextIR,
}

// Raw inputs collected from EvaluationRequest + EvaluationRecord
export interface ExperienceSource {
  readonly evaluationRecordId: string
  readonly sessionId: string
  readonly executionId: string
  readonly decisionId: string
  readonly intentHash: string              // SHA256(canonicalJSON(context.intent))
  readonly capabilityHash: string          // SHA256(canonicalJSON(context.installedCapabilities))
  readonly planHash: string                // SHA256(evaluation.provenance.decisionId) — proxy until 11B
  readonly observedOutcome: ObservedOutcome
  readonly predictionComparison: PredictionComparison
  readonly planningComparison: PlanningComparison
  readonly executionComparison: ExecutionComparison
  readonly scores: EvaluationScores
  readonly explanation: EvaluationExplanation
}

// Deterministic identity (Law 55)
export interface ExperienceFingerprint {
  readonly experienceId: string            // SHA256(intentHash + capabilityHash + planHash + evaluationFingerprint)
  readonly evaluationFingerprint: string   // evaluation.provenance.policyFingerprint (reused, not recomputed)
  readonly intentHash: string
  readonly capabilityHash: string
  readonly planHash: string
}

// Host context at capture time — not part of replay identity
export interface ExperienceMetadata {
  readonly schemaVersion: string           // ExperienceAssembler.SCHEMA_VERSION — bumped when record shape changes
  readonly captureVersion: string          // ExperienceRecorder.VERSION — bumped when capture logic changes
  readonly runtimeVersion: string
  readonly hostId: string
}

// Runtime noise — exempt from Law 55
export interface ExperienceTelemetry {
  readonly captureDurationMs: number
}

// Immutable historical artifact — Stage 12 and 13 depend on this, never on EvaluationRecord
// experienceId: deterministic from evidence (Law 55) — excludes producedAt + telemetry
export interface ExperienceRecord {
  readonly experienceId: string
  readonly evaluationRecordId: string      // pointer back — no embedded EvaluationRecord
  readonly sessionId: string
  readonly executionId: string
  readonly decisionId: string
  readonly observedOutcome: ObservedOutcome
  readonly predictionComparison: PredictionComparison
  readonly planningComparison: PlanningComparison
  readonly executionComparison: ExecutionComparison
  readonly scores: EvaluationScores
  readonly explanation: EvaluationExplanation
  readonly fingerprint: ExperienceFingerprint
  readonly metadata: ExperienceMetadata
  readonly telemetry: ExperienceTelemetry
  readonly producedAt: Date
}

// Input to ExperienceRecorder.record()
export interface ExperienceRequest {
  readonly experienceRequestId: string     // runtime request ID — not part of experienceId
  readonly evaluation: EvaluationRecord
  readonly context: WorkingContextIR       // from EvaluationRequest — needed for fingerprint hashes
  readonly requestedAt: Date
}

export const ExperienceEvent = Object.freeze({
  EXPERIENCE_RECORD_READY: 'EXPERIENCE_RECORD_READY',
} as const)
export type ExperienceEvent = typeof ExperienceEvent[keyof typeof ExperienceEvent]

export interface ExperienceRecordReadyPayload {
  readonly record: ExperienceRecord
  readonly metadata: {
    readonly runtimeVersion: string
    readonly hostId: string
    readonly timestamp: Date
  }
}
