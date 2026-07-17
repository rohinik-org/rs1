import { describe, it, expect } from 'vitest'
import { RemoteExecutor } from '../executor/remote-executor.js'
import { ClusterJournal } from '../journal/cluster-journal.js'
import type { DistributedTask } from '@rohinik-org/compiler'

function makeTask(id: string, targetNodeId = 'target-1'): DistributedTask {
  return { taskId: id, workflowPlanId: 'wp-1', targetNodeId, workflowFragment: { step: 1 }, routingDecision: 'test', scheduledAt: new Date().toISOString() }
}
const successTransport = { send: async () => ({ requestId: 'r', success: true, payload: {} }) }
const failTransport = { send: async () => ({ requestId: 'r', success: false, payload: {}, error: 'boom' }) }
const throwTransport = { send: async (): Promise<never> => { throw new Error('connection refused') } }

describe('RemoteExecutor', () => {
  it('produces RemoteInvocation with correct fields', async () => {
    const journal = new ClusterJournal()
    const exec = new RemoteExecutor('source-1', 'cluster-1', journal)
    const { invocation } = await exec.execute(makeTask('t1'), successTransport)
    expect(invocation.sourceNodeId).toBe('source-1')
    expect(invocation.targetNodeId).toBe('target-1')
    expect(invocation.workflowPlanId).toBe('wp-1')
  })
  it('produces RemoteInvocationResult with SUCCESS outcome', async () => {
    const journal = new ClusterJournal()
    const exec = new RemoteExecutor('source-1', 'cluster-1', journal)
    const { result } = await exec.execute(makeTask('t1'), successTransport)
    expect(result.outcome).toBe('SUCCESS')
    expect(result.targetNodeId).toBe('target-1')
  })
  it('produces FAILED outcome when transport returns success=false', async () => {
    const journal = new ClusterJournal()
    const exec = new RemoteExecutor('source-1', 'cluster-1', journal)
    const { result } = await exec.execute(makeTask('t1'), failTransport)
    expect(result.outcome).toBe('FAILED')
  })
  it('produces FAILED outcome when transport throws', async () => {
    const journal = new ClusterJournal()
    const exec = new RemoteExecutor('source-1', 'cluster-1', journal)
    const { result } = await exec.execute(makeTask('t1'), throwTransport)
    expect(result.outcome).toBe('FAILED')
  })
  it('journals REMOTE_INVOCATION_CREATED + REMOTE_DISPATCHED + REMOTE_COMPLETED', async () => {
    const journal = new ClusterJournal()
    const exec = new RemoteExecutor('source-1', 'cluster-1', journal)
    await exec.execute(makeTask('t1'), successTransport)
    const types = journal.getAll().map(e => e.eventType)
    expect(types).toContain('REMOTE_INVOCATION_CREATED')
    expect(types).toContain('REMOTE_DISPATCHED')
    expect(types).toContain('REMOTE_COMPLETED')
  })
  it('journals REMOTE_FAILED on failure', async () => {
    const journal = new ClusterJournal()
    const exec = new RemoteExecutor('source-1', 'cluster-1', journal)
    await exec.execute(makeTask('t1'), failTransport)
    expect(journal.getByEventType('REMOTE_FAILED').length).toBe(1)
  })
  it('produces DistributedExecutionRecord with invocationId', async () => {
    const journal = new ClusterJournal()
    const exec = new RemoteExecutor('source-1', 'cluster-1', journal)
    const { record, invocation } = await exec.execute(makeTask('t1'), successTransport)
    expect(record.invocationId).toBe(invocation.invocationId)
    expect(record.participatingNodeIds).toContain('source-1')
  })
  it('never throws — always returns result', async () => {
    const journal = new ClusterJournal()
    const exec = new RemoteExecutor('source-1', 'cluster-1', journal)
    await expect(exec.execute(makeTask('t1'), throwTransport)).resolves.toBeDefined()
  })
})
