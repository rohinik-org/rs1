import type { DistributedTask, ClusterPolicy } from '@rohinik-org/compiler'
import { CapabilityDirectory } from '../registry/capability-directory.js'
import { NodeRegistry } from '../registry/node-registry.js'
import type { NodeDescriptor } from '@rohinik-org/compiler'

export interface WorkflowFragment {
  readonly planId: string
  readonly requiredCapabilities: string[]
  readonly fragment?: unknown
}

export class DistributedScheduler {
  private readonly dir: CapabilityDirectory

  constructor(
    private readonly sourceNodeId: string,
    registry: NodeRegistry,
  ) {
    this.dir = new CapabilityDirectory(registry)
  }

  schedule(plan: WorkflowFragment, nodes: readonly NodeDescriptor[], policy: ClusterPolicy): DistributedTask[] {
    if (!policy.allowRemoteExecution) return []
    const online = nodes.filter(n => n.status === 'ONLINE' || n.status === 'DEGRADED')
    if (online.length === 0) return []

    // local-first: if sourceNode is in the pool and capable, use it
    const local = online.find(n => n.nodeId === this.sourceNodeId)
    let targetNodeId: string
    let routingDecision: string

    if (local) {
      const localScore = this.dir.score(this.sourceNodeId, plan.requiredCapabilities)
      if (localScore > 0 || plan.requiredCapabilities.length === 0) {
        targetNodeId = this.sourceNodeId
        routingDecision = `local-first: source node ${this.sourceNodeId} is capable (score=${localScore.toFixed(3)})`
      } else {
        const decision = this.dir.matchForTask(plan.requiredCapabilities, online)
        targetNodeId = decision.selectedNodeId
        routingDecision = `remote: local score=0, selected ${targetNodeId} (score=${(decision.scores[targetNodeId] ?? 0).toFixed(3)})`
      }
    } else {
      const decision = this.dir.matchForTask(plan.requiredCapabilities, online)
      targetNodeId = decision.selectedNodeId
      routingDecision = `remote: source not in pool, selected ${targetNodeId} (score=${(decision.scores[targetNodeId] ?? 0).toFixed(3)})`
    }

    return [{
      taskId: `dt-${plan.planId}-${Date.now()}`,
      workflowPlanId: plan.planId,
      targetNodeId,
      workflowFragment: plan.fragment ?? null,
      routingDecision,
      scheduledAt: new Date().toISOString(),
    }]
  }
}
