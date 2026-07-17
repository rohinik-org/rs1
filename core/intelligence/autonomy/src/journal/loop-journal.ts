import { randomUUID } from 'node:crypto'
import type { LoopJournalEntry, LoopEventType } from '@rohinik-org/compiler'
import type { LoopStore } from '../store/loop-store.js'

export class LoopJournal {
  constructor(
    private readonly loopId: string,
    private readonly store: LoopStore,
  ) {}

  async append(
    eventType: LoopEventType,
    payload?: Record<string, unknown>,
    goalId?: string,
    cycleNumber?: number,
  ): Promise<LoopJournalEntry> {
    const entry: LoopJournalEntry = {
      entryId: randomUUID(),
      loopId: this.loopId,
      eventType,
      ...(payload !== undefined && { payload }),
      ...(goalId !== undefined && { goalId }),
      ...(cycleNumber !== undefined && { cycleNumber }),
      recordedAt: new Date().toISOString(),
    }
    await this.store.saveJournalEntry(entry)
    return entry
  }

  async list(): Promise<LoopJournalEntry[]> {
    return this.store.listJournal(this.loopId)
  }
}
