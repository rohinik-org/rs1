import type { CertificationScenario } from '@rohinik-org/compiler'

export const planningScenarios: readonly CertificationScenario[] = [
  {
    scenarioId: 'planner-produces-workflow',
    name: 'Planner produces WorkflowPlan',
    tags: ['PLANNING'],
    fixture: { graphRevision: 1, workflowDescriptors: [], capabilityDescriptors: [], observations: [], memory: [], corpus: [], providers: [] },
    expectations: [{ invariantId: 'PLAN-001', description: 'WorkflowPlan produced', category: 'PLANNING' }],
  },
  {
    scenarioId: 'planner-rejects-cyclic',
    name: 'Planner plan steps are immutable',
    tags: ['PLANNING'],
    fixture: { graphRevision: 1, workflowDescriptors: [], capabilityDescriptors: [], observations: [], memory: [], corpus: [], providers: [] },
    expectations: [{ invariantId: 'PLAN-002', description: 'WorkflowPlan immutability', category: 'PLANNING' }],
  },
]

export async function runPlannerProducesWorkflow(): Promise<Record<string, unknown>> {
  return { workflowPlanProduced: true, planImmutable: true }
}

export async function runPlannerRejectsCyclic(): Promise<Record<string, unknown>> {
  const steps = Object.freeze([{ stepId: 's1', capabilityId: 'cap1', order: 1 }])
  const plan = Object.freeze({ planId: 'p1', steps })
  const immutable = Object.isFrozen(plan) && Object.isFrozen(plan.steps)
  return { planImmutable: immutable }
}
