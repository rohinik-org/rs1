import type { NetworkJournalEntry } from '@rohinik-org/compiler'

export interface NetworkJournal {
  record(entry: NetworkJournalEntry): void
  list(): readonly NetworkJournalEntry[]
}

export class InMemoryNetworkJournal implements NetworkJournal {
  private readonly entries: NetworkJournalEntry[] = []
  record(entry: NetworkJournalEntry): void { this.entries.push(entry) }
  list(): readonly NetworkJournalEntry[] { return this.entries }
}
