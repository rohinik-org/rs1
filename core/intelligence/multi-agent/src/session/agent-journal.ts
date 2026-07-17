import type { AgentJournalEntry, AgentEventType } from '@rohinik-org/compiler'

export class AgentJournal {
  private readonly entries: AgentJournalEntry[] = []

  append(sessionId: string, eventType: AgentEventType, agentId?: string, payload?: unknown): AgentJournalEntry {
    const entry: AgentJournalEntry = {
      entryId: crypto.randomUUID(),
      sessionId,
      eventType,
      ...(agentId !== undefined ? { agentId } : {}),
      payload: payload ?? null,
      timestamp: new Date().toISOString(),
    }
    this.entries.push(entry)
    return entry
  }

  getBySession(sessionId: string): readonly AgentJournalEntry[] {
    return this.entries.filter(e => e.sessionId === sessionId)
  }

  getAll(): readonly AgentJournalEntry[] { return this.entries }
}
