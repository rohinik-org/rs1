import { describe, it, expect } from 'vitest'
import { NodeRegistry } from '../registry/node-registry.js'
import { NodeDiscovery } from '../discovery/node-discovery.js'
import type { NodeDescriptor, NodeCapabilityProfile } from '@rohinik-org/compiler'

function makeNode(id: string, status: NodeDescriptor['status'] = 'ONLINE'): NodeDescriptor {
  return { nodeId: id, version: '1.0', hostname: `${id}.local`, region: 'us-east', capabilityProfileId: `${id}-p`, status, joinedAt: new Date().toISOString() }
}
function makeProfile(id: string): NodeCapabilityProfile {
  return { profileId: `${id}-p`, cpuCores: 4, memoryGb: 16, gpuAvailable: false, installedCapabilities: [], installedProviders: [], networkBandwidthMbps: 1000, latencyProfileMs: 10, costWeight: 0.1 }
}

describe('NodeDiscovery', () => {
  it('join registers node', () => {
    const reg = new NodeRegistry()
    const disc = new NodeDiscovery(reg)
    disc.join(makeNode('n1'), makeProfile('n1'))
    expect(reg.get('n1')?.nodeId).toBe('n1')
  })
  it('discover returns ONLINE nodes only', () => {
    const reg = new NodeRegistry()
    const disc = new NodeDiscovery(reg)
    disc.join(makeNode('n1', 'ONLINE'), makeProfile('n1'))
    disc.join(makeNode('n2', 'OFFLINE'), makeProfile('n2'))
    expect(disc.discover().length).toBe(1)
    expect(disc.discover()[0]!.nodeId).toBe('n1')
  })
  it('joinMany registers all', () => {
    const reg = new NodeRegistry()
    const disc = new NodeDiscovery(reg)
    disc.joinMany([
      { descriptor: makeNode('n1'), profile: makeProfile('n1') },
      { descriptor: makeNode('n2'), profile: makeProfile('n2') },
    ])
    expect(disc.all().length).toBe(2)
  })
  it('all returns every node regardless of status', () => {
    const reg = new NodeRegistry()
    const disc = new NodeDiscovery(reg)
    disc.join(makeNode('n1', 'ONLINE'), makeProfile('n1'))
    disc.join(makeNode('n2', 'DEGRADED'), makeProfile('n2'))
    expect(disc.all().length).toBe(2)
  })
})
