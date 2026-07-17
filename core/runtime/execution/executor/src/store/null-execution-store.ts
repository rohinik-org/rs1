import type { ExecutionResult, ExecutionCheckpoint } from '@rohinik-org/compiler'
import type { ExecutionStore } from './execution-store.js'

export class NullExecutionStore implements ExecutionStore {
  private readonly results = new Map<string, ExecutionResult>()
  private readonly checkpoints = new Map<string, ExecutionCheckpoint>()

  async saveResult(result: ExecutionResult): Promise<void> { this.results.set(result.executionId, result) }
  async loadResult(executionId: string): Promise<ExecutionResult | undefined> { return this.results.get(executionId) }
  async saveCheckpoint(checkpoint: ExecutionCheckpoint): Promise<void> { this.checkpoints.set(checkpoint.executionId, checkpoint) }
  async loadCheckpoint(executionId: string): Promise<ExecutionCheckpoint | undefined> { return this.checkpoints.get(executionId) }
}
