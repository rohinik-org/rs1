import type { MemoryScope } from '@rohinik-org/compiler'

export interface MemoryEntry {
  readonly entryId: string
  readonly agentId: string
  readonly taskId: string
  readonly scope: MemoryScope
  readonly key: string
  readonly value: unknown
}

export class AgentMemoryBridge {
  private readonly store = new Map<string, MemoryEntry>()

  write(entry: MemoryEntry): void {
    this.store.set(entry.entryId, entry)
  }

  // returns read-only filtered view for agentId — only sees its own entries plus GLOBAL/PROJECT/TASK
  createView(agentId: string, scope: MemoryScope): readonly MemoryEntry[] {
    return Array.from(this.store.values()).filter(e => {
      if (e.scope === 'GLOBAL' || e.scope === 'PROJECT' || e.scope === 'TASK') return true
      if (e.scope === 'PRIVATE') return e.agentId === agentId
      if (e.scope === 'EPHEMERAL') return e.agentId === agentId
      return false
    }).filter(e => scopeVisible(e.scope, scope))
  }

  // EPHEMERAL memory SHALL NOT outlive the AgentTask that created it
  destroyEphemeral(taskId: string): void {
    for (const [id, entry] of this.store) {
      if (entry.scope === 'EPHEMERAL' && entry.taskId === taskId) this.store.delete(id)
    }
  }

  // PRIVATE scope survives until agent lifetime boundary (explicit removeAgent call)
  removeAgent(agentId: string): void {
    for (const [id, entry] of this.store) {
      if (entry.agentId === agentId && entry.scope === 'PRIVATE') this.store.delete(id)
    }
  }

  size(): number { return this.store.size }
}

// which scopes a view at the requested scope level can see
function scopeVisible(entryScope: MemoryScope, viewScope: MemoryScope): boolean {
  const order: MemoryScope[] = ['EPHEMERAL', 'PRIVATE', 'TASK', 'PROJECT', 'GLOBAL']
  return order.indexOf(entryScope) >= order.indexOf(viewScope)
}
