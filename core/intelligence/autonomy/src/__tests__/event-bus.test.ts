import { describe, it, expect } from 'vitest'
import { EventBus } from '../bus/event-bus.js'
import { NullLoopStore, InMemoryLoopStore } from '../store/loop-store.js'
import type { Goal } from '@rohinik-org/compiler'

const makeGoal = (goalId: string, status: Goal['status'] = 'PENDING'): Goal => ({
  kind: 'Goal', schemaVersion: '1.0', goalId, origin: 'USER', priority: 50,
  intent: {
    intentId: 'i-1', schemaVersion: '1.0', rawInput: 'test', concepts: [],
    preferredSkills: [], constraints: { maxSteps: 10, allowParallel: false, preferredTier: 'STANDARD' },
    translatedBy: 'test', translationConfidence: 1, unresolvedTerms: [],
  },
  status, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
})

describe('EventBus', () => {
  it('publishes to subscriber', () => {
    const bus = new EventBus()
    const received: string[] = []
    bus.subscribe<string>('test', payload => received.push(payload))
    bus.publish('test', 'hello')
    expect(received).toEqual(['hello'])
  })

  it('unsubscribes handler', () => {
    const bus = new EventBus()
    const received: string[] = []
    const id = bus.subscribe<string>('test', payload => received.push(payload))
    bus.unsubscribe(id)
    bus.publish('test', 'ignored')
    expect(received).toHaveLength(0)
  })
})

describe('NullLoopStore', () => {
  it('returns empty for all reads', async () => {
    const store = new NullLoopStore()
    expect(await store.loadGoal('x')).toBeUndefined()
    expect(await store.listGoals()).toEqual([])
    expect(await store.listJournal('loop-1')).toEqual([])
  })
})

describe('InMemoryLoopStore', () => {
  it('save + load goal round-trip', async () => {
    const store = new InMemoryLoopStore()
    const goal = makeGoal('g-1')
    await store.saveGoal(goal)
    expect(await store.loadGoal('g-1')).toEqual(goal)
  })

  it('list goals by status', async () => {
    const store = new InMemoryLoopStore()
    await store.saveGoal(makeGoal('g-1', 'PENDING'))
    await store.saveGoal(makeGoal('g-2', 'COMPLETED'))
    const pending = await store.listGoals('PENDING')
    expect(pending).toHaveLength(1)
    expect(pending[0].goalId).toBe('g-1')
  })

  it('save + list journal entries by loopId', async () => {
    const store = new InMemoryLoopStore()
    await store.saveJournalEntry({ entryId: 'e-1', loopId: 'loop-1', eventType: 'LOOP_STARTED', recordedAt: new Date().toISOString() })
    await store.saveJournalEntry({ entryId: 'e-2', loopId: 'loop-2', eventType: 'HEARTBEAT', recordedAt: new Date().toISOString() })
    const entries = await store.listJournal('loop-1')
    expect(entries).toHaveLength(1)
    expect(entries[0].entryId).toBe('e-1')
  })
})
