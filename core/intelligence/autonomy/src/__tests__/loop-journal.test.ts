import { describe, it, expect, vi, afterEach } from 'vitest'
import { LoopJournal } from '../journal/loop-journal.js'
import { InMemoryLoopStore } from '../store/loop-store.js'
import { Scheduler } from '../scheduler/scheduler.js'

afterEach(() => vi.restoreAllMocks())

describe('LoopJournal', () => {
  it('append stores entry with correct loopId', async () => {
    const store = new InMemoryLoopStore()
    const journal = new LoopJournal('loop-1', store)
    const entry = await journal.append('LOOP_STARTED')
    expect(entry.loopId).toBe('loop-1')
    expect(entry.eventType).toBe('LOOP_STARTED')
  })

  it('list returns only entries for this loop', async () => {
    const store = new InMemoryLoopStore()
    const j1 = new LoopJournal('loop-1', store)
    const j2 = new LoopJournal('loop-2', store)
    await j1.append('LOOP_STARTED')
    await j2.append('HEARTBEAT')
    const entries = await j1.list()
    expect(entries).toHaveLength(1)
    expect(entries[0].eventType).toBe('LOOP_STARTED')
  })
})

describe('Scheduler', () => {
  it('fires callback after delay', async () => {
    vi.useFakeTimers()
    const scheduler = new Scheduler()
    const fn = vi.fn()
    scheduler.schedule(fn, 100)
    vi.advanceTimersByTime(150)
    expect(fn).toHaveBeenCalledOnce()
    scheduler.clear()
  })

  it('cancel prevents callback', async () => {
    vi.useFakeTimers()
    const scheduler = new Scheduler()
    const fn = vi.fn()
    const id = scheduler.schedule(fn, 100)
    scheduler.cancel(id)
    vi.advanceTimersByTime(150)
    expect(fn).not.toHaveBeenCalled()
  })

  it('clear stops all scheduled callbacks', async () => {
    vi.useFakeTimers()
    const scheduler = new Scheduler()
    const fn = vi.fn()
    scheduler.schedule(fn, 100)
    scheduler.schedule(fn, 200)
    scheduler.clear()
    vi.advanceTimersByTime(300)
    expect(fn).not.toHaveBeenCalled()
  })
})
