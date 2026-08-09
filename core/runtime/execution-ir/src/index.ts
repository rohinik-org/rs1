import type { ExecutionPlan, ExecutionStep, ExecutionOutcome, ExecutionStatus } from '@rohinik-org/kernel'
import type { PlanningDecision } from '@rohinik-org/planner-ir'
import type { OutputSchemaRef } from '@rohinik-org/execution-protocol-v1'

export type { ExecutionPlan, ExecutionStep, ExecutionOutcome, ExecutionStatus }

export type ExecutionState =
  | 'CREATED'
  | 'READY'
  | 'RUNNING'
  | 'WAITING'
  | 'RETRYING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'TIMED_OUT'
  | 'ROLLING_BACK'
  | 'ROLLED_BACK'

export interface ExecutionRequest {
  readonly executionId: string
  readonly decision: PlanningDecision
  readonly requestedAt: Date
  readonly timeoutMs?: number
  readonly cancellable: boolean
  /** Optional pre-allocated sessionId. Supervisor uses this if provided, otherwise generates one. */
  readonly sessionId?: string
  /** Stage 16C: when present, supervisor sets schemaIsBound on ExecutionContext. */
  readonly outputSchemaRef?: OutputSchemaRef
}

export interface ExecutionStepRecord {
  readonly stepId: string
  readonly skillId: string
  readonly state: ExecutionState
  readonly startedAt?: Date
  readonly completedAt?: Date
  readonly outcome?: ExecutionOutcome
  readonly attemptCount: number
}

export interface ExecutionSession {
  readonly sessionId: string
  readonly executionId: string
  readonly decisionId: string
  readonly planId: string
  readonly state: ExecutionState
  readonly stepRecords: ReadonlyArray<ExecutionStepRecord>
  readonly startedAt: Date
  readonly completedAt?: Date
  readonly cancelledAt?: Date
}

export const ExecutionEvent = Object.freeze({
  SESSION_CREATED:   'SESSION_CREATED',
  SESSION_STARTED:   'SESSION_STARTED',
  STEP_STARTED:      'STEP_STARTED',
  STEP_COMPLETED:    'STEP_COMPLETED',
  STEP_FAILED:       'STEP_FAILED',
  STEP_RETRYING:     'STEP_RETRYING',
  STEP_SKIPPED:      'STEP_SKIPPED',
  SESSION_COMPLETED: 'SESSION_COMPLETED',
  SESSION_FAILED:    'SESSION_FAILED',
  SESSION_CANCELLED: 'SESSION_CANCELLED',
  SESSION_TIMED_OUT: 'SESSION_TIMED_OUT',
} as const)
export type ExecutionEvent = typeof ExecutionEvent[keyof typeof ExecutionEvent]

export interface ExecutionEventPayload {
  readonly event: ExecutionEvent
  readonly sessionId: string
  readonly executionId: string
  readonly stepId?: string
  readonly state: ExecutionState
  readonly timestamp: Date
  readonly detail?: unknown
}

export interface ExecutionResult {
  readonly resultId: string
  readonly sessionId: string
  readonly executionId: string
  readonly decisionId: string
  readonly planId: string
  readonly finalState: ExecutionState
  readonly stepRecords: ReadonlyArray<ExecutionStepRecord>
  readonly totalDurationMs: number
  readonly completedAt: Date
}
