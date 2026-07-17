import type { ArtifactBase, ArtifactReference } from './artifact.js'

export type ExecutionStatus = 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'CANCELLED'

export interface StepExecutionReport {
  readonly nodeId: string
  readonly planStepId: string
  readonly requestId: string
  readonly status: 'SUCCESS' | 'FAILED' | 'SKIPPED'
  readonly output?: unknown
  readonly skillId?: string
  readonly tierId?: string
  readonly executionTimeMs?: number
}

export interface StepFailure {
  readonly nodeId: string
  readonly planStepId: string
  readonly errorCode: string
  readonly message: string
  readonly retried: boolean
}

export interface ExecutionReport extends ArtifactBase {
  readonly startedAt: string
  readonly endedAt: string
  readonly status: ExecutionStatus
  readonly stepReports: readonly StepExecutionReport[]
  readonly outputs: Readonly<Record<string, unknown>>
  readonly artifacts: readonly ArtifactReference[]
  readonly warnings: readonly string[]
  readonly failures: readonly StepFailure[]
}
