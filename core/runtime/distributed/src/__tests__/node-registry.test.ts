import { describe, it, expect } from 'vitest'
import { NodeRegistry } from '../registry/node-registry.js'
import type { NodeDescriptor, NodeCapabilityProfile } from '@rohinik-org/compiler'

function makeNode(id: string, region = 'us-east'): NodeDescriptor {
  return { nodeId: id, version: '1.0', hostname: `${id}.local`, region, capabilityProfileId: `${id}-p`, status: 'ONLINE', joinedAt: new Date().toISOString() }
}
function makeProfile(id: string, caps: string[] = []): NodeCapabilityProfile {
  return { profileId: `${id}-p`, cpuCores: 4, memoryGb: 16, gpuAvailable: false, installedCapabilities: caps, installedProviders: [], networkBandwidthMbps: 1000, latencyProfileMs: 10, costWeight: 0.1 }
}

describe('NodeRegistry', () => {
  it('register and get', () => {
    const reg = new NodeRegistry()
    reg.register(makeNode('n1'), makeProfile('n1'))
    expect(reg.get('n1')?.nodeId).toBe('n1')
  })
  it('getProfile returns profile', () => {
    const reg = new NodeRegistry()
    reg.register(makeNode('n1'), makeProfile('n1', ['ts']))
    expect(reg.getProfile('n1')?.installedCapabilities).toContain('ts')
  })
  it('list returns all', () => {
    const reg = new NodeRegistry()
    reg.register(makeNode('n1'), makeProfile('n1'))
    reg.register(makeNode('n2'), makeProfile('n2'))
    expect(reg.list().length).toBe(2)
  })
  it('byRegion filters', () => {
    const reg = new NodeRegistry()
    reg.register(makeNode('n1', 'us-east'), makeProfile('n1'))
    reg.register(makeNode('n2', 'eu-west'), makeProfile('n2'))
    expect(reg.byRegion('eu-west').length).toBe(1)
  })
  it('byStatus filters', () => {
    const reg = new NodeRegistry()
    reg.register(makeNode('n1'), makeProfile('n1'))
    reg.register({ ...makeNode('n2'), status: 'OFFLINE' }, makeProfile('n2'))
    expect(reg.byStatus('ONLINE').length).toBe(1)
  })
  it('removeById removes', () => {
    const reg = new NodeRegistry()
    reg.register(makeNode('n1'), makeProfile('n1'))
    expect(reg.removeById('n1')).toBe(true)
    expect(reg.get('n1')).toBeUndefined()
  })
})
