export interface ExecutionContext {
  readonly requestId: string
  readonly executionId: string
  readonly sessionId: string
  readonly workspaceId: string
  readonly userId?: string
  readonly permissions: ReadonlyArray<string>
  readonly requestBudget?: number
  readonly signal?: AbortSignal
  readonly schedulerHints?: {
    readonly maxDurationMs?: number
    readonly priority?: number
    readonly queue?: string
  }
}
