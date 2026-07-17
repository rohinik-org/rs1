import { describe, it, expect } from 'vitest'
import { DefaultClusterFacade, NoopClusterFacade } from '../facades/cluster-facade.js'
import type { NodeDescriptor, NodeCapabilityProfile, RemoteInvocation } from '@rohinik-org/compiler'

const node: NodeDescriptor = {
  nodeId: 'node-1', address: 'localhost', port: 9000,
  status: 'ONLINE', joinedAt: new Date().toISOString(), clusterId: 'c1',
}
const profile: NodeCapabilityProfile = {
  profileId: 'p1', capabilities: [], confidence: {}, preferredDomains: [],
  forbiddenDomains: [], maxConcurrency: 2, costWeight: 0.5, latencyWeight: 0.5,
}
const request: RemoteInvocation = {
  invocationId: 'inv-1', sourceNodeId: 'node-1', targetNodeId: 'node-2',
  distributedTaskId: 'task-1', workflowPlanId: 'plan-1',
  dispatchedAt: new Date().toISOString(), policyId: 'default',
}

describe('DefaultClusterFacade', () => {
  it('join() does not throw', () => {
    const facade = new DefaultClusterFacade()
    expect(() => facade.join(node, profile, 'c1')).not.toThrow()
  })

  it('invoke() returns a RemoteInvocationResult', async () => {
    const facade = new DefaultClusterFacade()
    const result = await facade.invoke(request)
    expect(result.invocationId).toBeDefined()
    expect(result.targetNodeId).toBe('node-2')
  })

  it('invoke() outcome is SUCCESS for mock transport', async () => {
    const facade = new DefaultClusterFacade()
    const result = await facade.invoke(request)
    expect(result.outcome).toBe('SUCCESS')
  })

  it('join() and invoke() can be called in sequence', async () => {
    const facade = new DefaultClusterFacade()
    facade.join(node, profile, 'c1')
    const result = await facade.invoke(request)
    expect(result.invocationId).toBeDefined()
  })

  it('coordinator is accessible', () => {
    const facade = new DefaultClusterFacade()
    expect(facade.coordinator).toBeDefined()
  })
})

describe('NoopClusterFacade', () => {
  it('join() is a no-op', () => {
    const facade = new NoopClusterFacade()
    expect(() => facade.join(node, profile, 'c1')).not.toThrow()
  })

  it('invoke() returns success result', async () => {
    const facade = new NoopClusterFacade()
    const result = await facade.invoke(request)
    expect(result.outcome).toBe('SUCCESS')
  })
})
