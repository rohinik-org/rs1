import type { ClusterMemoryScope, ClusterPolicy } from '@rohinik-org/compiler'

export interface RemoteMemoryEntry {
  readonly entryId: string
  readonly nodeId: string
  readonly scope: ClusterMemoryScope
  readonly key: string
  readonly value: unknown
}

export class RemoteMemoryBridge {
  private readonly store: RemoteMemoryEntry[] = []

  write(entry: RemoteMemoryEntry): void {
    this.store.push(entry)
  }

  query(nodeId: string, scope: ClusterMemoryScope, policy: ClusterPolicy): readonly RemoteMemoryEntry[] {
    if (!policy.allowReplication) return []
    return this.store.filter(e => e.nodeId === nodeId && e.scope === scope)
  }

  queryAll(scope: ClusterMemoryScope, policy: ClusterPolicy): readonly RemoteMemoryEntry[] {
    if (!policy.allowReplication) return []
    if (scope === 'CLUSTER_GLOBAL') return this.store.filter(e => e.scope === 'CLUSTER_GLOBAL')
    return this.store.filter(e => e.scope === scope)
  }
}
