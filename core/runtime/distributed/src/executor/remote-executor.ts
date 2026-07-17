import type { DistributedTask, RemoteInvocation, RemoteInvocationResult, DistributedExecutionRecord } from '@rohinik-org/compiler'
import type { ClusterJournal } from '../journal/cluster-journal.js'

export interface RemoteTransport {
  send(command: { requestId: string; type: string; payload: unknown }): Promise<{ requestId: string; success: boolean; payload: unknown; error?: string }>
}

export interface RemoteExecutionResult {
  readonly invocation: RemoteInvocation
  readonly result: RemoteInvocationResult
  readonly record: DistributedExecutionRecord
}

export class RemoteExecutor {
  constructor(
    private readonly sourceNodeId: string,
    private readonly clusterId: string,
    private readonly journal: ClusterJournal,
  ) {}

  async execute(task: DistributedTask, transport: RemoteTransport): Promise<RemoteExecutionResult> {
    const invocationId = `inv-${task.taskId}-${Date.now()}`
    const executionId = `exec-${invocationId}`
    const startAt = Date.now()

    const invocation: RemoteInvocation = {
      invocationId,
      sourceNodeId: this.sourceNodeId,
      targetNodeId: task.targetNodeId,
      distributedTaskId: task.taskId,
      workflowPlanId: task.workflowPlanId,
      dispatchedAt: new Date().toISOString(),
      policyId: 'default',
    }

    this.journal.append({
      entryId: `je-${invocationId}-created`,
      clusterId: this.clusterId,
      eventType: 'REMOTE_INVOCATION_CREATED',
      nodeId: this.sourceNodeId,
      payload: { invocationId },
      timestamp: new Date().toISOString(),
    })

    let outcome: RemoteInvocationResult['outcome'] = 'SUCCESS'
    let transportMs = 0

    try {
      const sendStart = Date.now()
      this.journal.append({
        entryId: `je-${invocationId}-dispatched`,
        clusterId: this.clusterId,
        eventType: 'REMOTE_DISPATCHED',
        nodeId: task.targetNodeId,
        payload: { invocationId, taskId: task.taskId },
        timestamp: new Date().toISOString(),
      })

      const response = await transport.send({
        requestId: invocationId,
        type: 'EXECUTE',
        payload: task.workflowFragment,
      })
      transportMs = Date.now() - sendStart

      if (!response.success) outcome = 'FAILED'
    } catch {
      outcome = 'FAILED'
    }

    const totalMs = Date.now() - startAt
    const execMs = Math.max(0, totalMs - transportMs)

    this.journal.append({
      entryId: `je-${invocationId}-completed`,
      clusterId: this.clusterId,
      eventType: outcome === 'SUCCESS' ? 'REMOTE_COMPLETED' : 'REMOTE_FAILED',
      nodeId: task.targetNodeId,
      payload: { invocationId, outcome },
      timestamp: new Date().toISOString(),
    })

    const result: RemoteInvocationResult = {
      invocationId,
      executionId,
      targetNodeId: task.targetNodeId,
      latencyMs: totalMs,
      transportLatencyMs: transportMs,
      executionLatencyMs: execMs,
      outcome,
      completedAt: new Date().toISOString(),
    }

    const record: DistributedExecutionRecord = {
      recordId: `rec-${invocationId}`,
      clusterId: this.clusterId,
      participatingNodeIds: [this.sourceNodeId, task.targetNodeId],
      invocationId,
      totalDurationMs: totalMs,
      failedNodeIds: outcome === 'SUCCESS' ? [] : [task.targetNodeId],
      completedAt: result.completedAt,
    }

    return { invocation, result, record }
  }
}
