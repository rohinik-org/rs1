import type { WorkflowDescriptor } from './workflow-descriptor.js'
import type { CapabilityPlanEvidence } from './capability-plan-evidence.js'

export type WorkflowOrigin = 'DISCOVERED' | 'SYNTHESIZED'

export interface WorkflowReference {
  readonly kind: WorkflowOrigin
  readonly workflowId: string
  readonly descriptor?: WorkflowDescriptor
  readonly synthesisEvidence?: CapabilityPlanEvidence
}

export interface WorkflowPlanCandidate {
  readonly candidateId: string
  readonly origin: WorkflowOrigin
  readonly workflowReference: WorkflowReference
  readonly scores: {
    readonly planningConfidence: number
    readonly evidenceConfidence: number
    readonly provenanceWeight: number
    readonly finalScore: number
  }
}
