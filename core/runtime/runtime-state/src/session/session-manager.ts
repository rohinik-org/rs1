import { randomUUID } from 'node:crypto'
import type { RuntimeSession, RuntimeEnvironment } from '../types.js'

export class SessionManager {
  private readonly sessions = new Map<string, RuntimeSession & { _requestNumber: number }>()

  create(adapterId: string, workspaceId: string, cwd = process.cwd()): RuntimeSession {
    const id = randomUUID()
    const env: RuntimeEnvironment = { cwd, variables: {}, aliases: {} }
    const session = { id, workspaceId, adapterId, startedAt: new Date(), environment: env, _requestNumber: 0 }
    this.sessions.set(id, session)
    return session
  }

  get(id: string): RuntimeSession | undefined {
    return this.sessions.get(id)
  }

  end(id: string): void {
    this.sessions.delete(id)
  }

  list(): ReadonlyArray<RuntimeSession> {
    return Array.from(this.sessions.values())
  }

  nextRequestNumber(sessionId: string): number {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error(`Session not found: ${sessionId}`)
    return ++session._requestNumber
  }
}
