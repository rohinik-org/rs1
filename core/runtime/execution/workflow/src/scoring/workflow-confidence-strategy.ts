import type { WorkflowEvidence } from '@rohinik-org/compiler'

export interface WorkflowConfidenceStrategy {
  readonly strategyId: string
  score(evidence: WorkflowEvidence): number
}
