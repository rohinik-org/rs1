import { describe, it, expect } from 'vitest'
import { NodeRegistry } from '../registry/node-registry.js'
import { ClusterJournal } from '../journal/cluster-journal.js'
import { ClusterCoordinator } from '../coordinator/cluster-coordinator.js'
import type { NodeDescriptor, NodeCapabilityProfile } from '@rohinik-org/compiler'

function makeNode(id: string): NodeDescriptor {
  return { nodeId: id, version: '1.0', hostname: `${id}.local`, region: 'us-east', capabilityProfileId: `${id}-p`, status: 'ONLINE', joinedAt: new Date().toISOString() }
}
function makeProfile(id: string): NodeCapabilityProfile {
  return { profileId: `${id}-p`, cpuCores: 4, memoryGb: 16, gpuAvailable: false, installedCapabilities: [], installedProviders: [], networkBandwidthMbps: 1000, latencyProfileMs: 10, costWeight: 0.1 }
}

describe('ClusterCoordinator', () => {
  it('join registers node and journals NODE_JOINED', () => {
    const reg = new NodeRegistry(); const journal = new ClusterJournal()
    const coord = new ClusterCoordinator(reg, journal)
    coord.join(makeNode('n1'), makeProfile('n1'), 'c1')
    expect(reg.get('n1')?.nodeId).toBe('n1')
    expect(journal.getByEventType('NODE_JOINED').length).toBe(1)
  })
  it('leave marks node OFFLINE and journals NODE_LEFT', () => {
    const reg = new NodeRegistry(); const journal = new ClusterJournal()
    const coord = new ClusterCoordinator(reg, journal)
    coord.join(makeNode('n1'), makeProfile('n1'), 'c1')
    coord.leave('n1', 'c1')
    expect(reg.get('n1')?.status).toBe('OFFLINE')
    expect(journal.getByEventType('NODE_LEFT').length).toBe(1)
  })
  it('failover marks node DEGRADED and journals FAILOVER', () => {
    const reg = new NodeRegistry(); const journal = new ClusterJournal()
    const coord = new ClusterCoordinator(reg, journal)
    coord.join(makeNode('n1'), makeProfile('n1'), 'c1')
    coord.failover('n1', 'c1')
    expect(reg.get('n1')?.status).toBe('DEGRADED')
    expect(journal.getByEventType('FAILOVER').length).toBe(1)
  })
  it('getCluster returns membership snapshot', () => {
    const reg = new NodeRegistry(); const journal = new ClusterJournal()
    const coord = new ClusterCoordinator(reg, journal)
    coord.join(makeNode('n1'), makeProfile('n1'), 'c1')
    coord.join(makeNode('n2'), makeProfile('n2'), 'c1')
    const cluster = coord.getCluster('c1')
    expect(cluster.members).toContain('n1')
    expect(cluster.members).toContain('n2')
  })
  it('leaving a node removes it from cluster membership', () => {
    const reg = new NodeRegistry(); const journal = new ClusterJournal()
    const coord = new ClusterCoordinator(reg, journal)
    coord.join(makeNode('n1'), makeProfile('n1'), 'c1')
    coord.leave('n1', 'c1')
    const cluster = coord.getCluster('c1')
    expect(cluster.members).not.toContain('n1')
  })
  it('failing node does not affect other nodes', () => {
    const reg = new NodeRegistry(); const journal = new ClusterJournal()
    const coord = new ClusterCoordinator(reg, journal)
    coord.join(makeNode('n1'), makeProfile('n1'), 'c1')
    coord.join(makeNode('n2'), makeProfile('n2'), 'c1')
    coord.failover('n1', 'c1')
    expect(reg.get('n2')?.status).toBe('ONLINE')
  })
})
