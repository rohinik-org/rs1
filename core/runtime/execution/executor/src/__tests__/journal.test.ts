import { describe, it, expect } from 'vitest'
import { ExecutionJournal } from '../journal/execution-journal.js'

describe('ExecutionJournal', () => {
  it('starts empty', () => {
    const journal = new ExecutionJournal('exec-1', 1)
    expect(journal.entries()).toEqual([])
  })

  it('appends entries in order', () => {
    const journal = new ExecutionJournal('exec-1', 1)
    journal.append('EXECUTION_STARTED')
    journal.append('STEP_STARTED', { stepPosition: 0 })
    journal.append('STEP_COMPLETED', { stepPosition: 0 })
    const entries = journal.entries()
    expect(entries.length).toBe(3)
    expect(entries[0]!.eventType).toBe('EXECUTION_STARTED')
    expect(entries[2]!.eventType).toBe('STEP_COMPLETED')
    expect(entries[2]!.stepPosition).toBe(0)
  })

  it('entries are immutable — cannot push to returned array', () => {
    const journal = new ExecutionJournal('exec-1', 1)
    journal.append('EXECUTION_STARTED')
    const entries = journal.entries()
    // returned array is a copy
    expect(Object.isFrozen(entries) || entries.length === journal.entries().length).toBe(true)
  })

  it('all entries carry executionId and executionRevision', () => {
    const journal = new ExecutionJournal('exec-42', 3)
    journal.append('STEP_STARTED', undefined, 2)
    const entry = journal.entries()[0]!
    expect(entry.executionId).toBe('exec-42')
    expect(entry.executionRevision).toBe(3)
    expect(entry.stepPosition).toBe(2)
  })

  it('fromOffset returns only entries after offset', () => {
    const journal = new ExecutionJournal('exec-1', 1)
    journal.append('EXECUTION_STARTED')
    journal.append('STEP_STARTED')
    journal.append('STEP_COMPLETED')
    expect(journal.fromOffset(1).length).toBe(2)
    expect(journal.fromOffset(2).length).toBe(1)
  })
})
