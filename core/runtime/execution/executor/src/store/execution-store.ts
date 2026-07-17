import type { ExecutionResult, ExecutionCheckpoint } from '@rohinik-org/compiler'

export interface ExecutionStore {
  saveResult(result: ExecutionResult): Promise<void>
  loadResult(executionId: string): Promise<ExecutionResult | undefined>
  saveCheckpoint(checkpoint: ExecutionCheckpoint): Promise<void>
  loadCheckpoint(executionId: string): Promise<ExecutionCheckpoint | undefined>
}
