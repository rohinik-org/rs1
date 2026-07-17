import type { AgentSession, AgentQuery } from '@rohinik-org/compiler'
import type { AgentSessionStore } from './agent-session-store.js'

export class NullAgentSessionStore implements AgentSessionStore {
  private readonly map = new Map<string, AgentSession>()

  async save(session: AgentSession): Promise<void> { this.map.set(session.sessionId, session) }
  async get(sessionId: string): Promise<AgentSession | undefined> { return this.map.get(sessionId) }
  async list(): Promise<readonly AgentSession[]> { return Array.from(this.map.values()) }
  async latest(): Promise<AgentSession | undefined> {
    return Array.from(this.map.values()).sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0]
  }
  async search(query: AgentQuery): Promise<readonly AgentSession[]> {
    return applyQuery(Array.from(this.map.values()), query)
  }
  async removeById(sessionId: string): Promise<boolean> { return this.map.delete(sessionId) }
}

export function applyQuery(sessions: AgentSession[], query: AgentQuery): AgentSession[] {
  let results = sessions
  if (query.topology !== undefined) results = results.filter(s => s.topology === query.topology)
  if (query.status !== undefined) results = results.filter(s => s.status === query.status)
  if (query.limit !== undefined) results = results.slice(0, query.limit)
  return results
}
