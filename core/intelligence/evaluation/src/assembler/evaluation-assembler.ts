import { createHash } from 'node:crypto'
import { randomUUID } from 'node:crypto'
import type {
  EvaluationRequest,
  ObservedOutcome,
  PredictionComparison,
  PlanningComparison,
  ExecutionComparison,
  EvaluationScores,
  EvaluationExplanation,
  EvaluationPolicyIR,
  EvaluationRecord,
  EvaluationProvenance,
  EvaluationTelemetry,
} from '@rohinik-org/evaluation-ir'

function canonicalJSON(obj: unknown): string {
  // Sort keys alphabetically for stable serialization across runtimes (Law 51)
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

export class EvaluationAssembler {
  assemble(
    request: EvaluationRequest,
    observed: ObservedOutcome,
    predComp: PredictionComparison,
    planComp: PlanningComparison,
    execComp: ExecutionComparison,
    scores: EvaluationScores,
    explanation: EvaluationExplanation,
    policy: EvaluationPolicyIR,
    scorerVersion: string,
    durationMs: number,
  ): EvaluationRecord {
    // policyFingerprint excludes scorerVersion — scorerVersion already in recordId independently
    const policyFingerprint = sha256(
      [
        policy.policyId,
        policy.policyVersion,
        policy.predictionWeight,
        policy.planningWeight,
        policy.executionWeight,
        policy.latencyThresholdPct,
        policy.failureConfidenceThreshold,
      ].join('|'),
    )

    // recordId based on evidence — not runtime IDs (Law 51)
    const recordId = sha256(
      canonicalJSON(observed) +
      canonicalJSON(predComp) +
      canonicalJSON(planComp) +
      canonicalJSON(execComp) +
      scorerVersion +
      policyFingerprint,
    )

    const provenance: EvaluationProvenance = Object.freeze({
      scorerVersion,
      policyFingerprint,
      decisionId: request.decision.decisionId,
      executionId: request.execution.executionId,
      ...(request.predictions.predictionId !== undefined
        ? { predictionId: request.predictions.predictionId }
        : {}),
    })

    const telemetry: EvaluationTelemetry = Object.freeze({ evaluationDurationMs: durationMs })

    return Object.freeze({
      recordId,
      evaluationId: request.evaluationId,
      requestId: randomUUID(),
      decisionId: request.decision.decisionId,
      executionId: request.execution.executionId,
      sessionId: request.session.sessionId,
      policyId: policy.policyId,
      policyVersion: policy.policyVersion,
      observedOutcome: observed,
      predictionComparison: predComp,
      planningComparison: planComp,
      executionComparison: execComp,
      scores,
      provenance,
      telemetry,
      explanation,
      producedAt: new Date(),
    })
  }
}
