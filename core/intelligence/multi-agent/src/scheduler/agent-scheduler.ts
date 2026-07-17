import type { AgentTask } from '@rohinik-org/compiler'

export type ScheduleMode = 'sequential' | 'parallel' | 'dependency'

// batches[i] must complete before batches[i+1] starts
export interface Schedule {
  readonly batches: readonly (readonly AgentTask[])[]
  readonly mode: ScheduleMode
}

export class AgentScheduler {
  schedule(tasks: readonly AgentTask[], mode: ScheduleMode): Schedule {
    if (tasks.length === 0) return { batches: [], mode }
    switch (mode) {
      case 'sequential': return { batches: tasks.map(t => [t]), mode }
      case 'parallel': return { batches: [tasks], mode }
      case 'dependency': return { batches: this._topologicalBatches(tasks), mode }
    }
  }

  // group tasks by workflowPlanId; tasks without a planId form batch 0
  private _topologicalBatches(tasks: readonly AgentTask[]): readonly (readonly AgentTask[])[] {
    const withPlan = new Map<string, AgentTask[]>()
    const noPlan: AgentTask[] = []
    for (const t of tasks) {
      if (t.workflowPlanId) {
        const g = withPlan.get(t.workflowPlanId) ?? []
        g.push(t)
        withPlan.set(t.workflowPlanId, g)
      } else {
        noPlan.push(t)
      }
    }
    const batches: (readonly AgentTask[])[] = []
    if (noPlan.length > 0) batches.push(noPlan)
    for (const group of withPlan.values()) batches.push(group)
    return batches
  }
}
