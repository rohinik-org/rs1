import type { NodeDescriptor, NodeCapabilityProfile, RemoteInvocation, RemoteInvocationResult } from '@rohinik-org/compiler'
import type { ClusterFacade } from './facade-types.js'
import { ClusterCoordinator, NodeRegistry, ClusterJournal, RemoteExecutor } from '@rohinik-org/distributed'

export class DefaultClusterFacade implements ClusterFacade {
  private readonly registry = new NodeRegistry()
  private readonly journal = new ClusterJournal()
  readonly coordinator: ClusterCoordinator

  constructor() {
    this.coordinator = new ClusterCoordinator(this.registry, this.journal)
  }

  join(node: NodeDescriptor, profile: NodeCapabilityProfile, clusterId: string): void {
    this.coordinator.join(node, profile, clusterId)
  }

  async invoke(request: RemoteInvocation): Promise<RemoteInvocationResult> {
    const executor = new RemoteExecutor(request.sourceNodeId, 'default', this.journal)
    const transport = { send: async () => ({ requestId: request.invocationId, success: true, payload: {} }) }
    const task = {
      taskId: request.distributedTaskId,
      targetNodeId: request.targetNodeId,
      workflowPlanId: request.workflowPlanId,
      workflowFragment: {},
      routingDecision: 'default',
      scheduledAt: request.dispatchedAt,
    }
    const { result } = await executor.execute(task, transport)
    return result
  }
}

export class NoopClusterFacade implements ClusterFacade {
  join(_node: NodeDescriptor, _profile: NodeCapabilityProfile, _clusterId: string): void {}

  invoke(request: RemoteInvocation): Promise<RemoteInvocationResult> {
    return Promise.resolve({
      invocationId: request.invocationId,
      executionId: '',
      targetNodeId: request.targetNodeId,
      latencyMs: 0,
      transportLatencyMs: 0,
      executionLatencyMs: 0,
      outcome: 'SUCCESS',
      completedAt: new Date().toISOString(),
    })
  }
}
