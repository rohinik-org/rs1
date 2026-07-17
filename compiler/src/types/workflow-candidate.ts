import type { ExecutionOutcome } from './execution-record.js'

export interface WorkflowStepStatistics {
  readonly executionCount: number
  readonly outcomeDistribution: Readonly<Record<ExecutionOutcome, number>>
  readonly averageLatencyMs: number
}

export interface WorkflowStep {
  readonly skillId: string
  readonly position: number
  readonly providerId?: string
  readonly hostId?: string
  readonly statistics: WorkflowStepStatistics
}

export interface WorkflowEvidence {
  readonly executionCount: number
  readonly successfulExecutions: number
  readonly failedExecutions: number
  readonly uniqueSessions: number
}

export interface WorkflowCandidateDefinition {
  readonly candidateId: string
  readonly steps: readonly WorkflowStep[]
}

export interface WorkflowCandidateStatistics {
  readonly confidence: number
  readonly successRate: number
  readonly averageLatencyMs: number
}

export interface WorkflowCandidate {
  readonly definition: WorkflowCandidateDefinition
  readonly statistics: WorkflowCandidateStatistics
  readonly evidence: WorkflowEvidence
}

export interface WorkflowCandidateSet {
  readonly kind: 'WorkflowCandidateSet'
  readonly schemaVersion: '1.0'
  readonly candidateSetId: string
  readonly producedAt: string
  readonly generatedBy: string
  readonly corpusWindow: { readonly start: string; readonly end: string }
  readonly recordsScanned: number
  readonly chainsGenerated: number
  readonly candidates: readonly WorkflowCandidate[]
}
