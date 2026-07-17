import type { ClusterDescriptor, ClusterQuery } from '@rohinik-org/compiler'
import type { ClusterStore } from './cluster-store.js'

export class NullClusterStore implements ClusterStore {
  private readonly map = new Map<string, ClusterDescriptor>()

  async save(cluster: ClusterDescriptor): Promise<void> { this.map.set(cluster.clusterId, cluster) }
  async get(clusterId: string): Promise<ClusterDescriptor | undefined> { return this.map.get(clusterId) }
  async list(): Promise<readonly ClusterDescriptor[]> { return Array.from(this.map.values()) }
  async search(query: ClusterQuery): Promise<readonly ClusterDescriptor[]> {
    return applyQuery(Array.from(this.map.values()), query)
  }
  async removeById(clusterId: string): Promise<boolean> { return this.map.delete(clusterId) }
}

export function applyQuery(clusters: ClusterDescriptor[], query: ClusterQuery): ClusterDescriptor[] {
  let results = clusters
  if (query.clusterId !== undefined) results = results.filter(c => c.clusterId === query.clusterId)
  if (query.limit !== undefined) results = results.slice(0, query.limit)
  return results
}
