import type { InteractionHistoryEntry } from '../types.js'

export class InteractionHistory {
  private readonly entries: InteractionHistoryEntry[] = []

  append(entry: InteractionHistoryEntry): void {
    this.entries.push(entry)
  }

  forSession(sessionId: string): ReadonlyArray<InteractionHistoryEntry> {
    return this.entries.filter(e => e.sessionId === sessionId)
  }

  search(query: string): ReadonlyArray<InteractionHistoryEntry> {
    const q = query.toLowerCase()
    return this.entries.filter(e => e.input.toLowerCase().includes(q) || e.output.toLowerCase().includes(q))
  }

  last(n: number): ReadonlyArray<InteractionHistoryEntry> {
    return this.entries.slice(-n)
  }

  all(): ReadonlyArray<InteractionHistoryEntry> {
    return this.entries
  }
}
