import type { RepositoryRecordId, PolicyReference } from '@rohinik-org/package-trust-repository'
import type {
  ReevaluationItemResult,
  ReevaluationOutcomeKind,
  TrustDecisionComparison,
  PackageTrustReevaluationWorkItem,
  ReevaluationBatchResult,
} from './types.js'

export function buildItemResult(params: {
  workItem: PackageTrustReevaluationWorkItem
  outcomeKind: ReevaluationOutcomeKind
  successorDecisionRecordId: RepositoryRecordId | undefined
  comparison: TrustDecisionComparison | undefined
  failureReason: string | undefined
  retryable: boolean
  completedAt: string
  policyReference?: PolicyReference
}): ReevaluationItemResult {
  return {
    workItemId: params.workItem.workItemId,
    outcomeKind: params.outcomeKind,
    priorDecisionRecordId: params.workItem.candidate.trustDecisionRecordId,
    successorDecisionRecordId: params.successorDecisionRecordId ?? undefined,
    comparison: params.comparison ?? undefined,
    // ponytail: prefer caller-supplied policyReference (trigger's), fall back to inputReferences
    policyReference: params.policyReference ?? params.workItem.inputReferences.currentPolicyReference,
    triggerIds: params.workItem.triggerIds,
    failureReason: params.failureReason ?? undefined,
    retryable: params.retryable,
    completedAt: params.completedAt,
  }
}

export function buildBatchResult(
  operationId: string,
  triggerIds: readonly string[],
  itemResults: readonly ReevaluationItemResult[],
  startedAt: string,
  completedAt: string,
): ReevaluationBatchResult {
  const completedCount = itemResults.filter(r =>
    r.outcomeKind === 'completed' || r.outcomeKind === 'completed-no-change' || r.outcomeKind === 'completed-degraded'
  ).length
  const failedCount = itemResults.filter(r =>
    r.outcomeKind === 'failed' || r.outcomeKind === 'retry-required'
  ).length
  const noChangeCount = itemResults.filter(r => r.outcomeKind === 'completed-no-change').length

  // Batch outcome: if all success → completed; any partial → partial-success; all failed → failed
  let batchOutcome: ReevaluationOutcomeKind
  if (itemResults.length === 0) {
    batchOutcome = 'no-candidates'
  } else if (failedCount === 0) {
    batchOutcome = noChangeCount === itemResults.length ? 'completed-no-change' : 'completed'
  } else if (completedCount === 0) {
    batchOutcome = 'failed'
  } else {
    batchOutcome = 'partial-success'
  }

  return {
    operationId,
    batchOutcome,
    triggerIds,
    itemResults,
    totalCandidates: itemResults.length,
    completedCount,
    failedCount,
    noChangeCount,
    startedAt,
    completedAt,
  }
}
