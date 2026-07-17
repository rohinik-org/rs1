import { describe, it, expect } from 'vitest'
import { AgentCommunicationBus } from '../bus/agent-communication-bus.js'

describe('AgentCommunicationBus', () => {
  it('publish creates immutable AgentMessage in journal', () => {
    const bus = new AgentCommunicationBus()
    bus.publish('agent-a', 'agent-b', { data: 1 })
    expect(bus.getJournal()).toHaveLength(1)
    expect(bus.getJournal()[0]?.senderAgentId).toBe('agent-a')
    expect(bus.getJournal()[0]?.recipientAgentId).toBe('agent-b')
  })

  it('subscriber receives message', () => {
    const bus = new AgentCommunicationBus()
    const received: unknown[] = []
    bus.subscribe('agent-b', msg => received.push(msg.payload))
    bus.publish('agent-a', 'agent-b', 'hello')
    expect(received).toHaveLength(1)
    expect(received[0]).toBe('hello')
  })

  it('unsubscribe stops delivery', () => {
    const bus = new AgentCommunicationBus()
    const received: unknown[] = []
    const id = bus.subscribe('agent-b', msg => received.push(msg))
    bus.unsubscribe(id)
    bus.publish('agent-a', 'agent-b', 'ignored')
    expect(received).toHaveLength(0)
  })

  it('journal preserves message order', () => {
    const bus = new AgentCommunicationBus()
    bus.publish('a', 'b', 1)
    bus.publish('a', 'b', 2)
    bus.publish('a', 'b', 3)
    expect(bus.getJournal().map(m => m.payload)).toEqual([1, 2, 3])
  })

  it('non-subscribed recipient still journals message', () => {
    const bus = new AgentCommunicationBus()
    bus.publish('a', 'nobody', 'payload')
    expect(bus.getJournal()).toHaveLength(1)
  })

  it('clear empties journal and handlers', () => {
    const bus = new AgentCommunicationBus()
    bus.publish('a', 'b', 'x')
    bus.clear()
    expect(bus.getJournal()).toHaveLength(0)
  })
})
