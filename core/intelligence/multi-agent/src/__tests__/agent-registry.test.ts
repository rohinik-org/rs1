import { describe, it, expect, beforeEach } from 'vitest'
import { AgentRegistry } from '../registry/agent-registry.js'
import { AgentCapabilityStore } from '../registry/agent-capability-store.js'
import type { AgentDescriptor, AgentCapabilityProfile } from '@rohinik-org/compiler'

function makeAgent(id: string, role: AgentDescriptor['role'] = 'EXECUTOR'): AgentDescriptor {
  return { agentId: id, name: id, role, capabilityProfileId: `${id}-profile`, version: '1.0' }
}
function makeProfile(id: string, caps: string[], confidence: Record<string, number> = {}): AgentCapabilityProfile {
  return { profileId: `${id}-profile`, capabilities: caps, confidence, preferredDomains: [], forbiddenDomains: [], maxConcurrency: 2, costWeight: 0.3, latencyWeight: 0.2 }
}

describe('AgentRegistry', () => {
  let registry: AgentRegistry

  beforeEach(() => { registry = new AgentRegistry() })

  it('register + get round-trip', () => {
    const a = makeAgent('a1', 'RESEARCHER')
    registry.register(a, makeProfile('a1', ['search']))
    expect(registry.get('a1')).toEqual(a)
  })

  it('byRole filters correctly', () => {
    registry.register(makeAgent('r1', 'RESEARCHER'), makeProfile('r1', []))
    registry.register(makeAgent('e1', 'EXECUTOR'), makeProfile('e1', []))
    expect(registry.byRole('RESEARCHER')).toHaveLength(1)
    expect(registry.byRole('EXECUTOR')).toHaveLength(1)
  })

  it('getProfileForAgent returns profile', () => {
    registry.register(makeAgent('a1'), makeProfile('a1', ['run']))
    const p = registry.getProfileForAgent('a1')
    expect(p?.capabilities).toContain('run')
  })

  it('removeById removes agent', () => {
    registry.register(makeAgent('a1'), makeProfile('a1', []))
    expect(registry.removeById('a1')).toBe(true)
    expect(registry.get('a1')).toBeUndefined()
  })

  it('list returns all registered agents', () => {
    registry.register(makeAgent('a1'), makeProfile('a1', []))
    registry.register(makeAgent('a2'), makeProfile('a2', []))
    expect(registry.list()).toHaveLength(2)
  })
})

describe('AgentCapabilityStore', () => {
  it('selects highest-scoring agent for required capabilities', () => {
    const registry = new AgentRegistry()
    const a = makeAgent('good', 'EXECUTOR')
    const b = makeAgent('bad', 'EXECUTOR')
    registry.register(a, { ...makeProfile('good', ['typescript', 'test'], { typescript: 0.95, test: 0.9 }) })
    registry.register(b, { ...makeProfile('bad', ['typescript'], { typescript: 0.4 }) })
    const store = new AgentCapabilityStore(registry)
    const decision = store.matchForTask(['typescript', 'test'], [a, b])
    expect(decision.selectedAgentId).toBe('good')
    expect(decision.rejectedAgentIds).toContain('bad')
    expect(decision.scores['good']!).toBeGreaterThan(decision.scores['bad']!)
  })
})
