import type { StructuredIntent } from './structured-intent.js'
import type { ObservationQuery } from './observation-ir-6e.js'

export type GoalOrigin = 'USER' | 'OBSERVATION' | 'MEMORY' | 'REFLECTION'

export type GoalStatus =
  | 'PENDING' | 'APPROVED' | 'DEFERRED' | 'REJECTED'
  | 'EXECUTING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'

export type LoopState = 'IDLE' | 'RUNNING' | 'PAUSED' | 'STOPPED' | 'CRASHED'

export type LoopEventType =
  | 'LOOP_STARTED' | 'LOOP_STOPPED' | 'LOOP_PAUSED' | 'LOOP_RESUMED' | 'LOOP_CRASHED'
  | 'CYCLE_STARTED' | 'CYCLE_COMPLETED'
  | 'GOAL_CREATED' | 'GOAL_APPROVED' | 'GOAL_DEFERRED' | 'GOAL_REJECTED'
  | 'GOAL_EXECUTING' | 'GOAL_COMPLETED' | 'GOAL_FAILED' | 'GOAL_CANCELLED'
  | 'TRIGGER_RECEIVED' | 'ACQUISITION_STARTED' | 'ACQUISITION_COMPLETED'
  | 'HEARTBEAT'

export interface Goal {
  readonly kind: 'Goal'
  readonly schemaVersion: '1.0'
  readonly goalId: string
  readonly origin: GoalOrigin
  readonly priority: number           // 0–100; higher = higher priority
  readonly intent: StructuredIntent
  readonly triggerRef?: string        // triggerId if origin = OBSERVATION
  readonly status: GoalStatus
  readonly createdAt: string          // ISO-8601
  readonly updatedAt: string          // ISO-8601
}

export interface AutonomyPolicy {
  readonly allowSelfPlanning: boolean
  readonly allowSelfExecution: boolean
  readonly allowAcquisition: boolean
  readonly allowInternet: boolean
  readonly allowFilesystem: boolean
  readonly allowProviderCalls: boolean
  readonly allowBackgroundExecution: boolean
  readonly requireApprovalFor: readonly GoalOrigin[]
  readonly maxConcurrentGoals: number
  readonly maxGoalAgeMs: number
  readonly maxContinuousRuntimeMs: number
  readonly observationTerms?: readonly string[]  // policy-driven observation scope
}

export const DEFAULT_AUTONOMY_POLICY: AutonomyPolicy = {
  allowSelfPlanning: true,
  allowSelfExecution: true,
  allowAcquisition: false,
  allowInternet: false,
  allowFilesystem: true,
  allowProviderCalls: false,
  allowBackgroundExecution: true,
  requireApprovalFor: ['OBSERVATION', 'MEMORY', 'REFLECTION'],
  maxConcurrentGoals: 3,
  maxGoalAgeMs: 3_600_000,
  maxContinuousRuntimeMs: 86_400_000,
}

export interface RuntimeState {
  readonly loopId: string
  readonly loopState: LoopState
  readonly cycleCount: number
  readonly activeGoals: number
  readonly queueDepth: number
  readonly uptimeMs: number
}

export interface ObservationQuerySet {
  readonly kind: 'ObservationQuerySet'
  readonly loopId: string
  readonly cycleNumber: number
  readonly queries: readonly ObservationQuery[]
  readonly producedAt: string
}

export interface LoopJournalEntry {
  readonly entryId: string
  readonly loopId: string
  readonly eventType: LoopEventType
  readonly payload?: Record<string, unknown>
  readonly goalId?: string
  readonly cycleNumber?: number
  readonly recordedAt: string
}

export interface AutonomyReport {
  readonly kind: 'AutonomyReport'
  readonly schemaVersion: '1.0'
  readonly reportId: string
  readonly loopId: string
  readonly startedAt: string
  readonly completedAt?: string
  readonly state: LoopState
  readonly cycleCount: number
  readonly goalsCreated: number
  readonly goalsCompleted: number
  readonly goalsFailed: number
  readonly goalsDeferred: number
}
