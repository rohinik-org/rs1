import type { InteractionContext } from './types.js'
import type { RuntimeIdentity, SessionManager } from '@rohinik-org/runtime-state'

export interface ContextFactoryOptions {
  adapterId: string
  transport: InteractionContext['transport']
  interactive?: boolean
  cwd?: string
  locale?: string
  identity: RuntimeIdentity
}

export class InteractionContextFactory {
  constructor(private readonly sessions: SessionManager) {}

  build(sessionId: string, workspaceId: string, opts: ContextFactoryOptions): InteractionContext {
    const requestNumber = this.sessions.nextRequestNumber(sessionId)
    return {
      sessionId,
      workspaceId,
      adapterId: opts.adapterId,
      transport: opts.transport,
      interactive: opts.interactive ?? false,
      cwd: opts.cwd ?? process.cwd(),
      locale: opts.locale ?? 'en-US',
      identity: opts.identity,
      requestNumber,
      timestamp: new Date(),
    }
  }

  buildForNewSession(workspaceId: string, opts: ContextFactoryOptions): { sessionId: string; context: InteractionContext } {
    const session = this.sessions.create(opts.adapterId, workspaceId, opts.cwd ?? process.cwd())
    const context = this.build(session.id, workspaceId, opts)
    return { sessionId: session.id, context }
  }
}
