import type { WorkflowPlan, ExecutionPolicy, ExecutionCheckpoint, ExecutionResult, ExecutionEvent, ExecutionState } from '@rohinik-org/compiler'

export interface ExecutionHandle {
  readonly executionId: string
  readonly state: ExecutionState
  cancel(): Promise<void>
  wait(): Promise<ExecutionResult>
  events(): AsyncIterable<ExecutionEvent>
}

export interface ExecutionKernel {
  execute(plan: WorkflowPlan, policy?: ExecutionPolicy): Promise<ExecutionHandle>
  resume(checkpoint: ExecutionCheckpoint, policy?: ExecutionPolicy): Promise<ExecutionHandle>
  cancel(executionId: string): Promise<void>
  getResult(executionId: string): Promise<ExecutionResult | null>
}
