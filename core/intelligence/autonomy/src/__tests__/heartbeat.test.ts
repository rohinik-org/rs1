import { describe, it, expect, vi, afterEach } from 'vitest'
import { Heartbeat } from '../supervisor/heartbeat.js'
import { RecoveryManager } from '../supervisor/recovery-manager.js'
import { LoopJournal } from '../journal/loop-journal.js'
import { InMemoryLoopStore } from '../store/loop-store.js'
import type { Goal } from '@rohinik-org/compiler'

afterEach(() => vi.restoreAllMocks())

const makeGoal = (goalId: string, status: Goal['status']): Goal => ({
  kind: 'Goal', schemaVersion: '1.0', goalId, origin: 'USER', priority: 50,
  intent: {
    intentId: 'i-1', schemaVersion: '1.0', rawInput: 'test', concepts: [],
    preferredSkills: [], constraints: {}, translatedBy: 'test', translationConfidence: 1, unresolvedTerms: [],
  },
  status, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
})

describe('Heartbeat', () => {
  it('emits HEARTBEAT entries at interval', async () => {
    vi.useFakeTimers()
    const store = new InMemoryLoopStore()
    const journal = new LoopJournal('loop-1', store)
    const hb = new Heartbeat(journal)
    hb.start(100)
    vi.advanceTimersByTime(350)
    hb.stop()
    // Allow async journal appends to settle
    await Promise.resolve()
    const entries = await journal.list()
    const beats = entries.filter(e => e.eventType === 'HEARTBEAT')
    expect(beats.length).toBeGreaterThanOrEqual(3)
  })

  it('stops emitting after stop()', async () => {
    vi.useFakeTimers()
    const store = new InMemoryLoopStore()
    const journal = new LoopJournal('loop-1', store)
    const hb = new Heartbeat(journal)
    hb.start(100)
    vi.advanceTimersByTime(150)
    hb.stop()
    await Promise.resolve()
    const countBefore = (await journal.list()).length
    vi.advanceTimersByTime(500)
    await Promise.resolve()
    const countAfter = (await journal.list()).length
    expect(countAfter).toBe(countBefore)
  })
})

describe('RecoveryManager', () => {
  it('returns pending and executing goals', async () => {
    const store = new InMemoryLoopStore()
    await store.saveGoal(makeGoal('g-1', 'PENDING'))
    await store.saveGoal(makeGoal('g-2', 'EXECUTING'))
    await store.saveGoal(makeGoal('g-3', 'COMPLETED'))
    const mgr = new RecoveryManager(store)
    const goals = await mgr.recover('loop-1')
    expect(goals.map(g => g.goalId).sort()).toEqual(['g-1', 'g-2'])
  })

  it('returns empty when no unfinished goals', async () => {
    const store = new InMemoryLoopStore()
    await store.saveGoal(makeGoal('g-1', 'COMPLETED'))
    const mgr = new RecoveryManager(store)
    const goals = await mgr.recover('loop-1')
    expect(goals).toHaveLength(0)
  })
})
