import type { WorkflowStep, WorkflowEvidence } from './workflow-candidate.js'

export type WorkflowStatus = 'ACTIVE' | 'DEPRECATED' | 'SUPERSEDED' | 'EXPERIMENTAL'

export interface WorkflowDescriptorDefinition {
  readonly steps: readonly WorkflowStep[]
  readonly name: string
}

export interface WorkflowDescriptorStatistics {
  readonly confidence: number
  readonly successRate: number
  readonly averageLatencyMs: number
  readonly evidence: WorkflowEvidence
}

export interface WorkflowDescriptorLineage {
  readonly derivedFromCandidateSetId: string
  readonly approvalId: string
  readonly approvalPolicyId: string
  readonly graphRevision: number
  readonly corpusRevision: number
  readonly discoveredAt: string
}

export interface WorkflowDescriptor {
  readonly kind: 'WorkflowDescriptor'
  readonly schemaVersion: '1.0'
  readonly workflowId: string
  readonly version: number
  readonly status: WorkflowStatus
  readonly definition: WorkflowDescriptorDefinition
  readonly statistics: WorkflowDescriptorStatistics
  readonly lineage: WorkflowDescriptorLineage
}
