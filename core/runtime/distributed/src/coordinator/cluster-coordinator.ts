import type { ClusterDescriptor, NodeDescriptor } from '@rohinik-org/compiler'
import type { ClusterJournal } from '../journal/cluster-journal.js'
import { NodeRegistry } from '../registry/node-registry.js'
import type { NodeCapabilityProfile } from '@rohinik-org/compiler'

export class ClusterCoordinator {
  private readonly clusters = new Map<string, Set<string>>()

  constructor(
    private readonly registry: NodeRegistry,
    private readonly journal: ClusterJournal,
  ) {}

  join(node: NodeDescriptor, profile: NodeCapabilityProfile, clusterId: string): void {
    this.registry.register(node, profile)
    if (!this.clusters.has(clusterId)) this.clusters.set(clusterId, new Set())
    this.clusters.get(clusterId)!.add(node.nodeId)
    this.journal.append({
      entryId: `jc-${node.nodeId}-joined-${Date.now()}`,
      clusterId,
      eventType: 'NODE_JOINED',
      nodeId: node.nodeId,
      payload: { nodeId: node.nodeId },
      timestamp: new Date().toISOString(),
    })
  }

  leave(nodeId: string, clusterId: string): void {
    this.registry.updateStatus(nodeId, 'OFFLINE')
    this.clusters.get(clusterId)?.delete(nodeId)
    this.journal.append({
      entryId: `jc-${nodeId}-left-${Date.now()}`,
      clusterId,
      eventType: 'NODE_LEFT',
      nodeId,
      payload: { nodeId },
      timestamp: new Date().toISOString(),
    })
  }

  failover(nodeId: string, clusterId: string): void {
    this.registry.updateStatus(nodeId, 'DEGRADED')
    this.journal.append({
      entryId: `jc-${nodeId}-failover-${Date.now()}`,
      clusterId,
      eventType: 'FAILOVER',
      nodeId,
      payload: { nodeId },
      timestamp: new Date().toISOString(),
    })
  }

  getCluster(clusterId: string): ClusterDescriptor {
    const members = Array.from(this.clusters.get(clusterId) ?? [])
    return {
      clusterId,
      members,
      leaderPolicy: 'NONE',
      createdAt: new Date().toISOString(),
    }
  }
}
