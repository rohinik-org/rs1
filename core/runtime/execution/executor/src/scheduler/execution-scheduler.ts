import type { WorkflowPlanStep } from '@rohinik-org/compiler'

export interface ScheduledStep {
  readonly step: WorkflowPlanStep
  readonly position: number
}

export interface ExecutionScheduler {
  schedule(steps: readonly WorkflowPlanStep[]): readonly ScheduledStep[]
}
