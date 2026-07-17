export type RuntimeJournalEventType =
  | 'RUNTIME_STARTED'
  | 'SERVICE_STARTED'
  | 'SERVICE_STOPPED'
  | 'SERVICE_FAILED'
  | 'COMMAND_RECEIVED'
  | 'COMMAND_COMPLETED'
  | 'RUNTIME_STOPPED'

export interface RuntimeJournalEntry {
  readonly entryId: string
  readonly eventType: RuntimeJournalEventType
  readonly payload?: Record<string, unknown>
  readonly recordedAt: string
}

export class RuntimeJournal {
  private readonly entries: RuntimeJournalEntry[] = []
  private entryCounter = 0

  append(eventType: RuntimeJournalEventType, payload?: Record<string, unknown>): void {
    this.entryCounter++
    const entry: RuntimeJournalEntry = {
      entryId: String(this.entryCounter),
      eventType,
      ...(payload !== undefined && { payload }),
      recordedAt: new Date().toISOString(),
    }
    this.entries.push(entry)
  }

  all(): readonly RuntimeJournalEntry[] {
    return this.entries
  }

  last(): RuntimeJournalEntry | undefined {
    return this.entries[this.entries.length - 1]
  }
}
