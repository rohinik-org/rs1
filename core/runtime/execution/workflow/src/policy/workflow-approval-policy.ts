import type { WorkflowCandidateSet, WorkflowApproval } from '@rohinik-org/compiler'

export interface WorkflowApprovalPolicy {
  readonly policyId: string
  review(candidateSet: WorkflowCandidateSet): Promise<WorkflowApproval>
}
