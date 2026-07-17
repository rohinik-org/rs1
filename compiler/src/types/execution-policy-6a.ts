export interface ExecutionPolicy {
  readonly maxExecutionTimeMs?: number
  readonly maxRetries?: number
  readonly maxCostUsd?: number
  readonly maxTotalTokens?: number
  readonly maxStepTokens?: number
  readonly allowParallel?: boolean
  readonly continueOnFailure?: boolean
  readonly allowNetwork?: boolean
  readonly allowFilesystem?: boolean
}

export const DEFAULT_EXECUTION_POLICY: ExecutionPolicy = {
  maxRetries: 3,
  allowParallel: false,
  continueOnFailure: false,
  allowNetwork: false,
  allowFilesystem: true,
}
