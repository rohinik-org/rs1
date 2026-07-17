import { describe, it, expect } from 'vitest'
import { NodeRegistry } from '../registry/node-registry.js'
import { DistributedScheduler } from '../scheduler/distributed-scheduler.js'
import { DEFAULT_CLUSTER_POLICY } from '@rohinik-org/compiler'
import type { NodeDescriptor, NodeCapabilityProfile } from '@rohinik-org/compiler'

function makeNode(id: string, status: NodeDescriptor['status'] = 'ONLINE'): NodeDescriptor {
  return { nodeId: id, version: '1.0', hostname: `${id}.local`, region: 'us-east', capabilityProfileId: `${id}-p`, status, joinedAt: new Date().toISOString() }
}
function makeProfile(id: string, caps: string[]): NodeCapabilityProfile {
  return { profileId: `${id}-p`, cpuCores: 4, memoryGb: 16, gpuAvailable: false, installedCapabilities: caps, installedProviders: [], networkBandwidthMbps: 1000, latencyProfileMs: 10, costWeight: 0.1 }
}

describe('DistributedScheduler', () => {
  it('produces a DistributedTask', () => {
    const reg = new NodeRegistry()
    const n1 = makeNode('node-1')
    reg.register(n1, makeProfile('node-1', ['ts']))
    const sched = new DistributedScheduler('node-1', reg)
    const tasks = sched.schedule({ planId: 'p1', requiredCapabilities: ['ts'] }, [n1], DEFAULT_CLUSTER_POLICY)
    expect(tasks.length).toBe(1)
    expect(tasks[0]!.workflowPlanId).toBe('p1')
  })
  it('local-first: routes to source node when capable', () => {
    const reg = new NodeRegistry()
    const local = makeNode('local'); const remote = makeNode('remote')
    reg.register(local, makeProfile('local', ['ts']))
    reg.register(remote, makeProfile('remote', ['ts']))
    const sched = new DistributedScheduler('local', reg)
    const tasks = sched.schedule({ planId: 'p1', requiredCapabilities: ['ts'] }, [local, remote], DEFAULT_CLUSTER_POLICY)
    expect(tasks[0]!.targetNodeId).toBe('local')
  })
  it('routes remote when source has no capability', () => {
    const reg = new NodeRegistry()
    const local = makeNode('local'); const remote = makeNode('remote')
    reg.register(local, makeProfile('local', []))
    reg.register(remote, makeProfile('remote', ['gpu']))
    const sched = new DistributedScheduler('local', reg)
    const tasks = sched.schedule({ planId: 'p1', requiredCapabilities: ['gpu'] }, [local, remote], DEFAULT_CLUSTER_POLICY)
    expect(tasks[0]!.targetNodeId).toBe('remote')
  })
  it('returns [] when allowRemoteExecution is false', () => {
    const reg = new NodeRegistry()
    const n1 = makeNode('n1')
    reg.register(n1, makeProfile('n1', ['ts']))
    const sched = new DistributedScheduler('n1', reg)
    const tasks = sched.schedule({ planId: 'p1', requiredCapabilities: ['ts'] }, [n1], { ...DEFAULT_CLUSTER_POLICY, allowRemoteExecution: false })
    expect(tasks.length).toBe(0)
  })
  it('returns [] when no ONLINE nodes', () => {
    const reg = new NodeRegistry()
    const n1 = makeNode('n1', 'OFFLINE')
    reg.register(n1, makeProfile('n1', ['ts']))
    const sched = new DistributedScheduler('n1', reg)
    const tasks = sched.schedule({ planId: 'p1', requiredCapabilities: ['ts'] }, [n1], DEFAULT_CLUSTER_POLICY)
    expect(tasks.length).toBe(0)
  })
  it('task includes routingDecision string', () => {
    const reg = new NodeRegistry()
    const n1 = makeNode('n1')
    reg.register(n1, makeProfile('n1', []))
    const sched = new DistributedScheduler('n1', reg)
    const tasks = sched.schedule({ planId: 'p1', requiredCapabilities: [] }, [n1], DEFAULT_CLUSTER_POLICY)
    expect(tasks[0]!.routingDecision.length).toBeGreaterThan(0)
  })
  it('task scheduledAt is ISO string', () => {
    const reg = new NodeRegistry()
    const n1 = makeNode('n1')
    reg.register(n1, makeProfile('n1', []))
    const sched = new DistributedScheduler('n1', reg)
    const tasks = sched.schedule({ planId: 'p1', requiredCapabilities: [] }, [n1], DEFAULT_CLUSTER_POLICY)
    expect(() => new Date(tasks[0]!.scheduledAt)).not.toThrow()
  })
  it('routes to highest-scoring node in two-node cluster', () => {
    const reg = new NodeRegistry()
    const strong = makeNode('strong'); const weak = makeNode('weak')
    reg.register(strong, makeProfile('strong', ['ts', 'test']))
    reg.register(weak, makeProfile('weak', ['ts']))
    const sched = new DistributedScheduler('other', reg)
    const tasks = sched.schedule({ planId: 'p1', requiredCapabilities: ['ts', 'test'] }, [strong, weak], DEFAULT_CLUSTER_POLICY)
    expect(tasks[0]!.targetNodeId).toBe('strong')
  })
})
