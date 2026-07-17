export interface PlanRetryPolicy {
  readonly maxAttempts: number
  readonly backoffStrategy: 'NONE' | 'LINEAR' | 'EXPONENTIAL'
}

export interface WorkflowPlanStep {
  readonly position: number
  readonly skillId: string
  readonly expectedInputType: string
  readonly expectedOutputType: string
  readonly sourceWorkflowPosition: number
  readonly retryPolicy?: PlanRetryPolicy
}
