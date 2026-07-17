import type { WorkflowEvidence } from '@rohinik-org/compiler'
import type { WorkflowConfidenceStrategy } from './workflow-confidence-strategy.js'

// ponytail: Wilson-style shrinkage — +5 prior prevents over-confidence on small samples
export class DefaultWorkflowConfidenceStrategy implements WorkflowConfidenceStrategy {
  readonly strategyId = 'DefaultWorkflowConfidenceStrategy'

  score(evidence: WorkflowEvidence): number {
    if (evidence.executionCount === 0) return 0
    return Math.min(evidence.successfulExecutions / (evidence.successfulExecutions + evidence.failedExecutions + 5), 0.95)
  }
}
