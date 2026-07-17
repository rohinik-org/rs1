import type { ExecutionJournalEntry, ExecutionEventType } from '@rohinik-org/compiler'

export class ExecutionJournal {
  private readonly _entries: ExecutionJournalEntry[] = []

  constructor(
    private readonly executionId: string,
    private readonly executionRevision: number,
  ) {}

  append(
    eventType: ExecutionEventType,
    payload?: Readonly<Record<string, unknown>>,
    stepPosition?: number,
  ): ExecutionJournalEntry {
    // ponytail: stepPosition can come from third arg or payload.stepPosition for convenience
    const resolvedPosition = stepPosition ?? (payload?.stepPosition as number | undefined)
    const entry: ExecutionJournalEntry = {
      executionId: this.executionId,
      executionRevision: this.executionRevision,
      timestamp: new Date().toISOString(),
      eventType,
      ...(resolvedPosition !== undefined ? { stepPosition: resolvedPosition } : {}),
      ...(payload ? { payload } : {}),
    }
    this._entries.push(entry)
    return entry
  }

  entries(): readonly ExecutionJournalEntry[] {
    return [...this._entries]
  }

  fromOffset(offset: number): readonly ExecutionJournalEntry[] {
    return this._entries.slice(offset)
  }

  get size(): number { return this._entries.length }
}
