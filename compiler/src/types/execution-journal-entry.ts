export type ExecutionEventType =
  | 'EXECUTION_STARTED'
  | 'STEP_STARTED'
  | 'STEP_COMPLETED'
  | 'STEP_FAILED'
  | 'STEP_SKIPPED'
  | 'PROVIDER_INVOKED'
  | 'RETRY_STARTED'
  | 'CHECKPOINT_SAVED'
  | 'EXECUTION_COMPLETED'
  | 'EXECUTION_FAILED'
  | 'EXECUTION_CANCELLED'
  | 'BUDGET_EXCEEDED'

export interface ExecutionJournalEntry {
  readonly executionId: string
  readonly executionRevision: number
  readonly timestamp: string          // ISO-8601
  readonly eventType: ExecutionEventType
  readonly stepPosition?: number
  readonly payload?: Readonly<Record<string, unknown>>
}
