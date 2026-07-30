import type {
  PackageTrustReevaluationPolicy,
  PackageTrustReevaluationCandidate,
  PackageTrustReevaluationTrigger,
  ReevaluationAssessmentPlan,
  AssessmentPlanKind,
} from './types.js'

export interface PolicyEvaluationResult {
  readonly assessmentPlan: ReevaluationAssessmentPlan
  readonly quarantineOnFailure: boolean
  readonly quarantineOnDowngrade: boolean
  readonly maxRetryCount: number
  readonly requireAtomicPersistence: boolean
}

export function evaluateReevaluationPolicy(
  candidate: PackageTrustReevaluationCandidate,
  trigger: PackageTrustReevaluationTrigger,
  policy: PackageTrustReevaluationPolicy,
): PolicyEvaluationResult {
  // Determine assessment plan kind
  const selectionReasonTypes = candidate.selectionReasons.map(r => r.reasonType)

  // If any reason requires reacquisition, use that
  const requiresReacquisition = selectionReasonTypes.some(r => policy.requireReacquisitionFor.includes(r))

  // Reuse is allowed only when policy explicitly permits AND trigger doesn't invalidate (L-9J-1207)
  const allowReuse = !requiresReacquisition &&
    selectionReasonTypes.every(r =>
      policy.allowAssessmentReuseFor.includes(r) || !policy.requireReacquisitionFor.includes(r)
    ) &&
    selectionReasonTypes.some(r => policy.allowAssessmentReuseFor.includes(r))

  let planKind: AssessmentPlanKind
  if (requiresReacquisition) {
    planKind = 'reacquire-then-recompute'
  } else if (allowReuse) {
    planKind = 'reuse-evidence'
  } else {
    planKind = 'full-recompute'
  }

  // Determine which assessments can be reused (only if plan allows)
  const reuseableAssessmentKinds: string[] = planKind === 'reuse-evidence'
    ? candidate.currentPolicyReference.policyId === policy.policyId
      ? candidate.selectionReasons
          .filter(r => policy.allowAssessmentReuseFor.includes(r.reasonType))
          .map(r => r.reasonType)
      : []
    : []

  return {
    assessmentPlan: {
      planKind,
      reuseableAssessmentKinds,
      requiresReacquisition,
      reason: planKind,
    },
    quarantineOnFailure: policy.quarantineOnPipelineFailure,
    quarantineOnDowngrade: policy.quarantineOnPendingDowngrade,
    maxRetryCount: policy.maxRetryCount,
    requireAtomicPersistence: policy.requireAtomicSuccessorPersistence,
  }
}
