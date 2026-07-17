import type { WorkflowPlan, PlanningTrace } from '@rohinik-org/compiler'

export interface PlanStore {
  savePlan(plan: WorkflowPlan): Promise<void>
  saveTrace(trace: PlanningTrace): Promise<void>
  loadPlan(planId: string): Promise<WorkflowPlan | undefined>
}
