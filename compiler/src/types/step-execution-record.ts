export type StepExecutionState = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'SKIPPED'

export interface StepExecutionRecord {
  readonly stepId: string
  readonly position: number
  readonly skillId: string
  readonly state: StepExecutionState
  readonly startedAt?: string       // ISO-8601
  readonly completedAt?: string     // ISO-8601
  readonly attempts: number
  readonly providerUsed?: string
  readonly input?: unknown
  readonly output?: unknown
  readonly error?: string
}
