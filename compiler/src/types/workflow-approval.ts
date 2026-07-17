export type WorkflowDecisionOutcome = 'APPROVED' | 'REJECTED' | 'DEFERRED' | 'MANUAL_REVIEW'

export interface WorkflowDecision {
  readonly candidateId: string
  readonly decision: WorkflowDecisionOutcome
  readonly reason?: string
}

export interface WorkflowApproval {
  readonly kind: 'WorkflowApproval'
  readonly schemaVersion: '1.0'
  readonly approvalId: string
  readonly candidateSetId: string
  readonly reviewedAt: string
  readonly policyId: string
  readonly thresholdUsed: number
  readonly decisions: readonly WorkflowDecision[]
}
