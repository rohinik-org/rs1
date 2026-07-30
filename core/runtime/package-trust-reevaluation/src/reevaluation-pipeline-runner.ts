import type { TrustPipeline } from './ports/trust-pipeline.js'
import type {
  PackageTrustReevaluationWorkItem,
  PackageTrustPipelineResult,
} from './types.js'

// L-9J-1201: only invokes approved pipeline port — no local trust logic
// L-9J-1209: does not modify the decision returned by Task 10
export async function runPipeline(
  workItem: PackageTrustReevaluationWorkItem,
  pipeline: TrustPipeline,
): Promise<PackageTrustPipelineResult> {
  const result = await pipeline.reevaluate({
    operationId: workItem.operationId,
    workItemId: workItem.workItemId,
    subject: workItem.candidate.subject,
    artifactIdentity: workItem.candidate.artifactIdentity,
    priorDecisionRecordId: workItem.candidate.trustDecisionRecordId,
    assessmentPlan: workItem.assessmentPlan,
    inputReferences: workItem.inputReferences,
    reevaluationPolicy: workItem.reevaluationPolicy,
    requestedAt: workItem.requestedAt,
  })
  // Return unchanged — L-9J-1209
  return result
}
