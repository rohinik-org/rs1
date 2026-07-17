import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { AgentSession, AgentQuery } from '@rohinik-org/compiler'
import type { AgentSessionStore } from './agent-session-store.js'
import { applyQuery } from './null-agent-session-store.js'

export class JsonAgentSessionStore implements AgentSessionStore {
  private readonly dir: string

  constructor(runtimeDir = '.rohinik') {
    this.dir = join(runtimeDir, 'multi-agent')
  }

  private async ensureDir(): Promise<void> { await fs.mkdir(this.dir, { recursive: true }) }
  private path(sessionId: string): string { return join(this.dir, `${sessionId}.json`) }

  async save(session: AgentSession): Promise<void> {
    await this.ensureDir()
    await fs.writeFile(this.path(session.sessionId), JSON.stringify(session, null, 2), 'utf-8')
  }

  async get(sessionId: string): Promise<AgentSession | undefined> {
    try { return JSON.parse(await fs.readFile(this.path(sessionId), 'utf-8')) as AgentSession }
    catch { return undefined }
  }

  async list(): Promise<readonly AgentSession[]> {
    try {
      const files = (await fs.readdir(this.dir)).filter(f => f.endsWith('.json'))
      const items = await Promise.all(files.map(f => this.get(f.replace('.json', ''))))
      return items.filter((s): s is AgentSession => s !== undefined)
    } catch { return [] }
  }

  async latest(): Promise<AgentSession | undefined> {
    const all = await this.list()
    return [...all].sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0]
  }

  async search(query: AgentQuery): Promise<readonly AgentSession[]> {
    return applyQuery([...(await this.list())], query)
  }

  async removeById(sessionId: string): Promise<boolean> {
    try { await fs.unlink(this.path(sessionId)); return true }
    catch { return false }
  }
}
