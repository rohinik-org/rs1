import type { WorkflowDescriptor } from './workflow-descriptor.js'

export interface WorkflowMatchEvidence {
  readonly workflowId: string
  readonly descriptor: WorkflowDescriptor
  readonly matchedConcepts: readonly string[]
  readonly unmatchedConcepts: readonly string[]
  readonly rawMatchScore: number
}
