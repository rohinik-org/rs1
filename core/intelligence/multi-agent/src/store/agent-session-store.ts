import type { AgentSession, AgentQuery } from '@rohinik-org/compiler'

export interface AgentSessionStore {
  save(session: AgentSession): Promise<void>
  get(sessionId: string): Promise<AgentSession | undefined>
  list(): Promise<readonly AgentSession[]>
  latest(): Promise<AgentSession | undefined>
  search(query: AgentQuery): Promise<readonly AgentSession[]>
  removeById(sessionId: string): Promise<boolean>
}
