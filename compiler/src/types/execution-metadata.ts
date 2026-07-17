export interface ExecutionMetadata {
  readonly planId: string
  readonly workflowId?: string
  readonly parentExecutionId?: string
  readonly triggeredBy?: string
}
