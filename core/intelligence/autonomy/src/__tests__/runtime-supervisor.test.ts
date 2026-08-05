import { describe, it, expect, vi, afterEach } from 'vitest'
import { RuntimeSupervisor } from '../supervisor/runtime-supervisor.js'
import { LoopJournal } from '../journal/loop-journal.js'
import { InMemoryLoopStore } from '../store/loop-store.js'
import { GoalQueue } from '../queue/goal-queue.js'
import type { Goal, LoopState } from '@rohinik-org/compiler'

afterEach(() => { vi.restoreAllMocks() })

const makeStore = () => new InMemoryLoopStore()
const makeJournal = (store: InMemoryLoopStore) => new LoopJournal('loop-s', store)

const makeGoal = (goalId: string, status: Goal['status']): Goal => ({
  kind: 'Goal', schemaVersion: '1.0', goalId, origin: 'USER', priority: 50,
  intent: {
    intentId: 'i-1', schemaVersion: '1.0', rawInput: 'test', concepts: [],
    preferredSkills: [], constraints: {}, translatedBy: 'test', translationConfidence: 1, unresolvedTerms: [],
  },
  status, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
})

const makeHandle = (state: LoopState) => ({
  loopId: 'loop-s',
  get state() { return state },
  pause: () => {},
  resume: () => {},
  stop: () => {},
  report: () => { throw new Error('unused') },
})

describe('RuntimeSupervisor', () => {
  it('starts heartbeat on attach and stops on detach', async () => {
    vi.useFakeTimers()
    const store = makeStore()
    const journal = makeJournal(store)
    const queue = new GoalQueue()
    const supervisor = new RuntimeSupervisor(journal, store, queue, 100)

    supervisor.attach(makeHandle('RUNNING'))
    vi.advanceTimersByTime(250)
    supervisor.detach()
    await Promise.resolve()
    const countAfterDetach = (await journal.list()).length
    vi.advanceTimersByTime(500)
    await Promise.resolve()

    const beats = (await journal.list()).filter(e => e.eventType === 'HEARTBEAT')
    expect(beats.length).toBeGreaterThanOrEqual(2)
    expect((await journal.list()).length).toBe(countAfterDetach)
  })

  it('re-queues PENDING and EXECUTING goals on recovery', async () => {
    const store = makeStore()
    await store.saveGoal(makeGoal('g-pending', 'PENDING'))
    await store.saveGoal(makeGoal('g-executing', 'EXECUTING'))
    await store.saveGoal(makeGoal('g-done', 'COMPLETED'))
    const journal = makeJournal(store)
    const queue = new GoalQueue()
    const supervisor = new RuntimeSupervisor(journal, store, queue)

    await supervisor.recoverFrom('loop-s')
    expect(queue.size()).toBe(2)
    const ids = queue.list().map(g => g.goalId).sort()
    expect(ids).toEqual(['g-executing', 'g-pending'])
  })

  it('triggers recovery immediately when attached to CRASHED handle', async () => {
    const store = makeStore()
    await store.saveGoal(makeGoal('g-crashed', 'PENDING'))
    const journal = makeJournal(store)
    const queue = new GoalQueue()
    const supervisor = new RuntimeSupervisor(journal, store, queue)

    await supervisor.recoverFrom('loop-s')
    expect(queue.size()).toBe(1)
    expect(queue.list()[0]!.goalId).toBe('g-crashed')
  })
})
