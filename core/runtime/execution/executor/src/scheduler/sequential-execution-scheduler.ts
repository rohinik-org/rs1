import type { WorkflowPlanStep } from '@rohinik-org/compiler'
import type { ExecutionScheduler, ScheduledStep } from './execution-scheduler.js'

export class SequentialExecutionScheduler implements ExecutionScheduler {
  schedule(steps: readonly WorkflowPlanStep[]): readonly ScheduledStep[] {
    return [...steps]
      .sort((a, b) => a.position - b.position)
      .map(step => ({ step, position: step.position }))
  }
}
