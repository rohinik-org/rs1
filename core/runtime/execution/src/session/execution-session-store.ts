import type { ExecutionSession, ExecutionEventPayload } from '@rohinik-org/execution-ir'

export interface ExecutionSessionStore {
  save(session: ExecutionSession): Promise<void>
  load(sessionId: string): Promise<ExecutionSession | undefined>
  loadByExecutionId(executionId: string): Promise<ExecutionSession | undefined>
  listEvents(sessionId: string): Promise<ExecutionEventPayload[]>
  appendEvent(sessionId: string, event: ExecutionEventPayload): Promise<void>
}

export class InMemoryExecutionSessionStore implements ExecutionSessionStore {
  private sessions = new Map<string, ExecutionSession>()
  private byExecutionId = new Map<string, string>()
  private events = new Map<string, ExecutionEventPayload[]>()

  async save(session: ExecutionSession): Promise<void> {
    this.sessions.set(session.sessionId, session)
    this.byExecutionId.set(session.executionId, session.sessionId)
  }

  async load(sessionId: string): Promise<ExecutionSession | undefined> {
    return this.sessions.get(sessionId)
  }

  async loadByExecutionId(executionId: string): Promise<ExecutionSession | undefined> {
    const sessionId = this.byExecutionId.get(executionId)
    return sessionId ? this.sessions.get(sessionId) : undefined
  }

  async listEvents(sessionId: string): Promise<ExecutionEventPayload[]> {
    return [...(this.events.get(sessionId) ?? [])]
  }

  async appendEvent(sessionId: string, event: ExecutionEventPayload): Promise<void> {
    const list = this.events.get(sessionId) ?? []
    this.events.set(sessionId, [...list, event])
  }
}
