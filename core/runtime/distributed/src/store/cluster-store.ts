import type { ClusterDescriptor, ClusterQuery } from '@rohinik-org/compiler'

export interface ClusterStore {
  save(cluster: ClusterDescriptor): Promise<void>
  get(clusterId: string): Promise<ClusterDescriptor | undefined>
  list(): Promise<readonly ClusterDescriptor[]>
  search(query: ClusterQuery): Promise<readonly ClusterDescriptor[]>
  removeById(clusterId: string): Promise<boolean>
}
