import { randomUUID } from 'node:crypto'
import type {
  ExperienceRequest,
  ExperienceSource,
  ExperienceFingerprint,
  ExperienceRecord,
  ExperienceMetadata,
  ExperienceTelemetry,
} from '@rohinik-org/experience-ir'

export class ExperienceAssembler {
  static readonly SCHEMA_VERSION = '1.0.0'

  assemble(
    request: ExperienceRequest,
    source: ExperienceSource,
    fingerprint: ExperienceFingerprint,
    captureVersion: string,
    durationMs: number,
  ): ExperienceRecord {
    const metadata: ExperienceMetadata = Object.freeze({
      schemaVersion: ExperienceAssembler.SCHEMA_VERSION,
      captureVersion,
      runtimeVersion: '0.1.0',
      hostId: randomUUID(),
    })

    const telemetry: ExperienceTelemetry = Object.freeze({ captureDurationMs: durationMs })

    return Object.freeze({
      experienceId: fingerprint.experienceId,
      evaluationRecordId: source.evaluationRecordId,
      sessionId: source.sessionId,
      executionId: source.executionId,
      decisionId: source.decisionId,
      observedOutcome: source.observedOutcome,
      predictionComparison: source.predictionComparison,
      planningComparison: source.planningComparison,
      executionComparison: source.executionComparison,
      scores: source.scores,
      explanation: source.explanation,
      fingerprint,
      metadata,
      telemetry,
      producedAt: new Date(),
    })
  }
}
