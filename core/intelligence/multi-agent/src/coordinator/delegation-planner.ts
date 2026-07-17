import type { AgentGoal, AgentTask, AgentSelectionDecision, AgentDescriptor, AgentTopology } from '@rohinik-org/compiler'
import { AgentRegistry } from '../registry/agent-registry.js'
import { AgentCapabilityStore } from '../registry/agent-capability-store.js'

export interface DelegationPlan {
  readonly tasks: readonly AgentTask[]
  readonly selectionDecisions: readonly AgentSelectionDecision[]
}

export class DelegationPlanner {
  private readonly capStore: AgentCapabilityStore

  constructor(private readonly registry: AgentRegistry) {
    this.capStore = new AgentCapabilityStore(registry)
  }

  plan(goal: AgentGoal, agents: readonly AgentDescriptor[], topology: AgentTopology): DelegationPlan {
    if (agents.length === 0) return { tasks: [], selectionDecisions: [] }

    // stage 1: role filter — workers (non-COORDINATOR) preferred for work
    const workers = agents.filter(a => a.role !== 'COORDINATOR')
    const pool: readonly AgentDescriptor[] = workers.length > 0 ? workers : agents

    // derive required capabilities from goal constraints (used as capability names)
    const requiredCaps = goal.constraints

    // stage 2: one selection decision per topology — PIPELINE/TREE assign one per slot, STAR/MESH assigns one per worker
    const assignmentCount = topologyAssignmentCount(topology, pool.length)
    const tasks: AgentTask[] = []
    const selectionDecisions: AgentSelectionDecision[] = []

    for (let i = 0; i < assignmentCount; i++) {
      // each slot considers all remaining eligible agents (no re-assignment tracking needed at this layer)
      const decision = this.capStore.matchForTask(requiredCaps, pool)
      selectionDecisions.push(decision)
      if (decision.selectedAgentId) {
        tasks.push({
          taskId: crypto.randomUUID(),
          goalId: goal.goalId,
          assignedAgentId: decision.selectedAgentId,
        })
      }
    }

    return { tasks, selectionDecisions }
  }
}

// how many agent slots does this topology produce for N workers
function topologyAssignmentCount(topology: AgentTopology, workerCount: number): number {
  switch (topology) {
    case 'PIPELINE': return Math.min(workerCount, 3)  // up to 3-stage pipeline
    case 'TREE': return workerCount
    case 'STAR': return workerCount
    case 'MESH': return workerCount
  }
}

export class AgentCoordinator {
  private readonly planner: DelegationPlanner

  constructor(private readonly registry: AgentRegistry) {
    this.planner = new DelegationPlanner(registry)
  }

  coordinate(goal: AgentGoal, agents: readonly AgentDescriptor[], topology: AgentTopology): DelegationPlan {
    return this.planner.plan(goal, agents, topology)
  }
}
