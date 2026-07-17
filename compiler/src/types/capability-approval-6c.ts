export type ApprovalDecision = 'APPROVED' | 'REJECTED' | 'DEFERRED'

export interface CapabilityApproval {
  readonly kind: 'CapabilityApproval'
  readonly approvalId: string
  readonly candidateId: string
  readonly reportId: string
  readonly decision: ApprovalDecision
  readonly decidedBy: 'POLICY' | 'HUMAN'
  readonly reason?: string
  readonly decidedAt: string
}
