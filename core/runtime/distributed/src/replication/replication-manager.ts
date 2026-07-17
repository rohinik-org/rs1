import type { ReplicationRecord, ClusterPolicy } from '@rohinik-org/compiler'
import type { ClusterJournal } from '../journal/cluster-journal.js'

export type ReplicatableArtifactType = ReplicationRecord['artifactType']

export class ReplicationManager {
  constructor(
    private readonly sourceNodeId: string,
    private readonly journal: ClusterJournal,
  ) {}

  replicate(
    artifactType: ReplicatableArtifactType,
    artifactId: string,
    targetNodeIds: string[],
    policy: ClusterPolicy,
  ): ReplicationRecord | null {
    if (!policy.allowReplication) {
      this.journal.append({
        entryId: `jr-${artifactId}-rejected`,
        clusterId: 'default',
        eventType: 'POLICY_REJECTED',
        nodeId: this.sourceNodeId,
        payload: { reason: 'allowReplication=false', artifactId },
        timestamp: new Date().toISOString(),
      })
      return null
    }

    this.journal.append({
      entryId: `jr-${artifactId}-start`,
      clusterId: 'default',
      eventType: 'REPLICATION_STARTED',
      nodeId: this.sourceNodeId,
      payload: { artifactId, targetNodeIds },
      timestamp: new Date().toISOString(),
    })

    const record: ReplicationRecord = {
      recordId: `rep-${artifactId}-${Date.now()}`,
      artifactType,
      artifactId,
      sourceNodeId: this.sourceNodeId,
      replicatedToNodeIds: targetNodeIds,
      replicatedAt: new Date().toISOString(),
    }

    this.journal.append({
      entryId: `jr-${artifactId}-done`,
      clusterId: 'default',
      eventType: 'REPLICATION_COMPLETED',
      nodeId: this.sourceNodeId,
      payload: { artifactId, recordId: record.recordId },
      timestamp: new Date().toISOString(),
    })

    return record
  }
}
