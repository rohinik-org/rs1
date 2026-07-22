import { createHash } from 'node:crypto'
import type { EvaluationRecord } from '@rohinik-org/evaluation-ir'
import type { ExperienceRequest, ExperienceSource } from '@rohinik-org/experience-ir'

function canonicalJSON(obj: unknown): string {
  return JSON.stringify(obj, (_k, v: unknown) => {
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      const sorted: Record<string, unknown> = {}
      for (const key of Object.keys(v as Record<string, unknown>).sort()) {
        sorted[key] = (v as Record<string, unknown>)[key]
      }
      return sorted
    }
    return v
  })
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

export class ExperienceCollector {
  collect(request: ExperienceRequest, evaluation: EvaluationRecord): ExperienceSource {
    return Object.freeze({
      evaluationRecordId: evaluation.recordId,
      sessionId: evaluation.sessionId,
      executionId: evaluation.executionId,
      decisionId: evaluation.decisionId,
      intentHash: sha256(canonicalJSON(request.context.intent)),
      capabilityHash: sha256(canonicalJSON(request.context.installedCapabilities)),
      planHash: sha256(evaluation.provenance.decisionId), // ponytail: proxy — full plan hash in Stage 11B
      observedOutcome: evaluation.observedOutcome,
      predictionComparison: evaluation.predictionComparison,
      planningComparison: evaluation.planningComparison,
      executionComparison: evaluation.executionComparison,
      scores: evaluation.scores,
      explanation: evaluation.explanation,
    })
  }
}
