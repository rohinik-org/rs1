import { randomUUID } from 'node:crypto'
import type { SessionContext, BindingTable } from '../types/compiler-context.js'
import type { ArtifactReference } from '../types/artifact.js'

export class SessionManager {
  private session: SessionContext | undefined

  create(): SessionContext {
    this.session = { sessionId: randomUUID(), bindings: {}, activeArtifacts: [] }
    return this.session
  }

  current(): SessionContext {
    if (!this.session) throw new Error('No active session. Call create() first.')
    return this.session
  }

  bind(name: string, value: unknown): SessionContext {
    if (!this.session) throw new Error('No active session. Call create() first.')
    this.session = {
      ...this.session,
      bindings: { ...this.session.bindings, [name]: value } as BindingTable,
    }
    return this.session
  }

  addArtifact(ref: ArtifactReference): SessionContext {
    if (!this.session) throw new Error('No active session. Call create() first.')
    this.session = { ...this.session, activeArtifacts: [...this.session.activeArtifacts, ref] }
    return this.session
  }
}
