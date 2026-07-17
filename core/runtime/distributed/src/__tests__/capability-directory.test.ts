import { describe, it, expect } from 'vitest'
import { NodeRegistry } from '../registry/node-registry.js'
import { CapabilityDirectory } from '../registry/capability-directory.js'
import type { NodeDescriptor, NodeCapabilityProfile } from '@rohinik-org/compiler'

function makeNode(id: string): NodeDescriptor {
  return { nodeId: id, version: '1.0', hostname: `${id}.local`, region: 'us-east', capabilityProfileId: `${id}-p`, status: 'ONLINE', joinedAt: new Date().toISOString() }
}
function makeProfile(id: string, caps: string[], latencyMs = 10, costWeight = 0.1): NodeCapabilityProfile {
  return { profileId: `${id}-p`, cpuCores: 4, memoryGb: 16, gpuAvailable: false, installedCapabilities: caps, installedProviders: [], networkBandwidthMbps: 1000, latencyProfileMs: latencyMs, costWeight }
}

describe('CapabilityDirectory', () => {
  it('score 0 for missing profile', () => {
    const reg = new NodeRegistry()
    const dir = new CapabilityDirectory(reg)
    expect(dir.score('unknown', ['ts'])).toBe(0)
  })
  it('score 1 when no capabilities required', () => {
    const reg = new NodeRegistry()
    reg.register(makeNode('n1'), makeProfile('n1', [], 0, 0))
    const dir = new CapabilityDirectory(reg)
    expect(dir.score('n1', [])).toBe(1)
  })
  it('higher score for more matching caps', () => {
    const reg = new NodeRegistry()
    reg.register(makeNode('strong'), makeProfile('strong', ['ts', 'test'], 10, 0.1))
    reg.register(makeNode('weak'), makeProfile('weak', ['ts'], 10, 0.1))
    const dir = new CapabilityDirectory(reg)
    expect(dir.score('strong', ['ts', 'test'])).toBeGreaterThan(dir.score('weak', ['ts', 'test']))
  })
  it('matchForTask selects highest scorer', () => {
    const reg = new NodeRegistry()
    const n1 = makeNode('n1'); const n2 = makeNode('n2')
    reg.register(n1, makeProfile('n1', ['ts', 'test']))
    reg.register(n2, makeProfile('n2', ['ts']))
    const dir = new CapabilityDirectory(reg)
    const decision = dir.matchForTask(['ts', 'test'], [n1, n2])
    expect(decision.selectedNodeId).toBe('n1')
    expect(decision.rejectedNodeIds).toContain('n2')
  })
  it('matchForTask records scores for all candidates', () => {
    const reg = new NodeRegistry()
    const n1 = makeNode('n1'); const n2 = makeNode('n2')
    reg.register(n1, makeProfile('n1', ['ts']))
    reg.register(n2, makeProfile('n2', ['ts']))
    const dir = new CapabilityDirectory(reg)
    const decision = dir.matchForTask(['ts'], [n1, n2])
    expect(Object.keys(decision.scores).length).toBe(2)
  })
  it('matchForTask produces selectedAt timestamp', () => {
    const reg = new NodeRegistry()
    const n1 = makeNode('n1')
    reg.register(n1, makeProfile('n1', ['ts']))
    const dir = new CapabilityDirectory(reg)
    const decision = dir.matchForTask(['ts'], [n1])
    expect(typeof decision.selectedAt).toBe('string')
  })
})
