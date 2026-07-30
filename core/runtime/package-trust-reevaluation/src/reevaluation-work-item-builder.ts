import type {
  PackageTrustReevaluationCandidate,
  PackageTrustReevaluationPolicy,
  PackageTrustReevaluationTrigger,
  PackageTrustReevaluationWorkItem,
  ReevaluationAssessmentPlan,
  ReevaluationInputReferences,
} from './types.js'

export function buildWorkItem(
  candidate: PackageTrustReevaluationCandidate,
  triggers: readonly PackageTrustReevaluationTrigger[],
  reevaluationPolicy: PackageTrustReevaluationPolicy,
  assessmentPlan: ReevaluationAssessmentPlan,
  inputReferences: ReevaluationInputReferences,
  operationId: string,
  requestedAt: string,
): PackageTrustReevaluationWorkItem {
  // Deterministic work item ID: hash of operation + candidate record + first trigger
  const workItemId = `wi-${operationId}-${candidate.trustDecisionRecordId}`

  return {
    workItemId,
    operationId,
    candidate,
    triggerIds: triggers.map(t => t.triggerId),
    reevaluationPolicy,
    assessmentPlan,
    inputReferences,
    requestedAt,
    expectedRepositoryRevision: candidate.repositoryRevision,
  }
}
