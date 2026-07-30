import type {
  PackageTrustDecisionRecord,
  RepositoryWriteReceipt,
  RepositoryPage,
  RepositoryRevision,
} from '../types.js'

export interface TrustRecordQuery {
  readonly packageId?:      string
  readonly version?:        string
  readonly artifactDigest?: string
  readonly from?:           string
  readonly to?:             string
  readonly cursor?:         string
  readonly limit?:          number
}

export interface TrustRecordStore {
  append(record: PackageTrustDecisionRecord): Promise<RepositoryWriteReceipt>
  getById(recordId: string): Promise<PackageTrustDecisionRecord | undefined>
  query(query: TrustRecordQuery): Promise<RepositoryPage<PackageTrustDecisionRecord>>
  getCurrentRevision(): RepositoryRevision
}
