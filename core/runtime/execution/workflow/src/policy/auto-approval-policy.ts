import { randomUUID } from 'node:crypto'
import type { WorkflowCandidateSet, WorkflowApproval, WorkflowDecision } from '@rohinik-org/compiler'
import type { WorkflowApprovalPolicy } from './workflow-approval-policy.js'

export class AutoApprovalPolicy implements WorkflowApprovalPolicy {
  readonly policyId = 'AutoApprovalPolicy'

  constructor(private readonly threshold: number = 0.8) {}

  async review(candidateSet: WorkflowCandidateSet): Promise<WorkflowApproval> {
    const decisions: WorkflowDecision[] = candidateSet.candidates.map(c => ({
      candidateId: c.definition.candidateId,
      decision: c.statistics.confidence >= this.threshold ? ('APPROVED' as const) : ('REJECTED' as const),
    }))
    return {
      kind: 'WorkflowApproval',
      schemaVersion: '1.0',
      approvalId: randomUUID(),
      candidateSetId: candidateSet.candidateSetId,
      reviewedAt: new Date().toISOString(),
      policyId: this.policyId,
      thresholdUsed: this.threshold,
      decisions,
    }
  }
}
