import type {
  PackageTrustEventRecord,
  RepositoryPage,
} from '../types.js'

export interface TrustEventQuery {
  readonly subject?:     { packageId: string; version?: string }
  readonly eventType?:   string
  readonly from?:        string
  readonly to?:          string
  readonly cursor?:      string
  readonly limit?:       number
}

export interface TrustEventStore {
  append(event: PackageTrustEventRecord): Promise<void>
  query(query: TrustEventQuery): Promise<RepositoryPage<PackageTrustEventRecord>>
}
