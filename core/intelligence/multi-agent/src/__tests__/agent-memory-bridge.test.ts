import { describe, it, expect } from 'vitest'
import { AgentMemoryBridge } from '../memory/agent-memory-bridge.js'
import type { MemoryEntry } from '../memory/agent-memory-bridge.js'

function makeEntry(id: string, agentId: string, taskId: string, scope: MemoryEntry['scope'], key = 'k'): MemoryEntry {
  return { entryId: id, agentId, taskId, scope, key, value: id }
}

describe('AgentMemoryBridge', () => {
  it('write + createView returns own GLOBAL entries', () => {
    const bridge = new AgentMemoryBridge()
    bridge.write(makeEntry('e1', 'agent-a', 't1', 'GLOBAL'))
    const view = bridge.createView('agent-a', 'GLOBAL')
    expect(view).toHaveLength(1)
  })

  it('EPHEMERAL not visible to other agents', () => {
    const bridge = new AgentMemoryBridge()
    bridge.write(makeEntry('e1', 'agent-a', 't1', 'EPHEMERAL'))
    bridge.write(makeEntry('e2', 'agent-b', 't1', 'EPHEMERAL'))
    const view = bridge.createView('agent-a', 'EPHEMERAL')
    expect(view.every(e => e.agentId === 'agent-a')).toBe(true)
  })

  it('PRIVATE not visible to other agents', () => {
    const bridge = new AgentMemoryBridge()
    bridge.write(makeEntry('e1', 'agent-a', 't1', 'PRIVATE'))
    const view = bridge.createView('agent-b', 'EPHEMERAL')
    expect(view.find(e => e.agentId === 'agent-a')).toBeUndefined()
  })

  it('destroyEphemeral removes only matching taskId entries', () => {
    const bridge = new AgentMemoryBridge()
    bridge.write(makeEntry('e1', 'a', 't1', 'EPHEMERAL'))
    bridge.write(makeEntry('e2', 'a', 't2', 'EPHEMERAL'))
    bridge.destroyEphemeral('t1')
    expect(bridge.size()).toBe(1)
  })

  it('destroyEphemeral does not remove PRIVATE entries', () => {
    const bridge = new AgentMemoryBridge()
    bridge.write(makeEntry('e1', 'a', 't1', 'PRIVATE'))
    bridge.destroyEphemeral('t1')
    expect(bridge.size()).toBe(1)
  })

  it('removeAgent removes PRIVATE entries for that agent', () => {
    const bridge = new AgentMemoryBridge()
    bridge.write(makeEntry('e1', 'a', 't1', 'PRIVATE'))
    bridge.write(makeEntry('e2', 'b', 't1', 'PRIVATE'))
    bridge.removeAgent('a')
    expect(bridge.createView('a', 'EPHEMERAL').filter(e => e.scope === 'PRIVATE' && e.agentId === 'a')).toHaveLength(0)
    expect(bridge.createView('b', 'EPHEMERAL').filter(e => e.scope === 'PRIVATE' && e.agentId === 'b')).toHaveLength(1)
  })

  it('GLOBAL entries visible to all agents', () => {
    const bridge = new AgentMemoryBridge()
    bridge.write(makeEntry('e1', 'system', 't0', 'GLOBAL'))
    expect(bridge.createView('agent-a', 'GLOBAL')).toHaveLength(1)
    expect(bridge.createView('agent-b', 'GLOBAL')).toHaveLength(1)
  })
})
