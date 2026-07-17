export interface ExecutionCheckpoint {
  readonly executionId: string
  readonly executionRevision: number
  readonly planId: string
  readonly completedSteps: readonly number[]
  readonly currentStep: number
  readonly executionContextHash: string
  readonly journalOffset: number
  readonly savedAt: string  // ISO-8601
}
