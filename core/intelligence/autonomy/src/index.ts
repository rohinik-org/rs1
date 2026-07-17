export const AUTONOMY_VERSION = '0.1.0'

export { EventBus } from './bus/event-bus.js'
export { NullLoopStore, InMemoryLoopStore } from './store/loop-store.js'
export type { LoopStore } from './store/loop-store.js'
export { GoalQueue } from './queue/goal-queue.js'
export { TriggerRouter } from './router/trigger-router.js'
export { ObservationPlanner, SystemStrategy, GoalStrategy, PolicyStrategy, ScheduleStrategy } from './observation/observation-planner.js'
export type { ObservationStrategy } from './observation/observation-planner.js'
export { AutonomyPolicyEngine } from './policy/autonomy-policy-engine.js'
export { ApprovalManager } from './approval/approval-manager.js'
export { LoopJournal } from './journal/loop-journal.js'
export { Scheduler } from './scheduler/scheduler.js'
export { Heartbeat } from './supervisor/heartbeat.js'
export { RecoveryManager } from './supervisor/recovery-manager.js'
export { RuntimeSupervisor } from './supervisor/runtime-supervisor.js'
export { LoopEngine } from './engine/loop-engine.js'
export type {
  ObservationEnginePort,
  WorkflowPlannerPort,
  ExecutionEnginePort,
  EpisodicRecorderPort,
  LoopHandle,
} from './engine/loop-engine.js'
