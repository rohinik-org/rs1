import type { ExecutionJournalEntry } from './execution-journal-entry.js'

export interface ExecutionEvent extends ExecutionJournalEntry {
  readonly planId: string
}
