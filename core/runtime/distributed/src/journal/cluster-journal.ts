import type { ClusterJournalEntry, ClusterEventType } from '@rohinik-org/compiler'

export class ClusterJournal {
  private readonly entries: ClusterJournalEntry[] = []

  append(entry: ClusterJournalEntry): void {
    this.entries.push(entry)
  }

  getAll(): readonly ClusterJournalEntry[] {
    return [...this.entries]
  }

  getByCluster(clusterId: string): readonly ClusterJournalEntry[] {
    return this.entries.filter(e => e.clusterId === clusterId)
  }

  getByEventType(eventType: ClusterEventType): readonly ClusterJournalEntry[] {
    return this.entries.filter(e => e.eventType === eventType)
  }

  getByNode(nodeId: string): readonly ClusterJournalEntry[] {
    return this.entries.filter(e => e.nodeId === nodeId)
  }
}
