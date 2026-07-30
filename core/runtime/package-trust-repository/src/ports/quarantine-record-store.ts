import type {
  PackageQuarantineRecord,
  RepositoryRevision,
  RepositoryPage,
} from '../types.js'

export interface QuarantineRecordQuery {
  readonly packageId?:      string
  readonly version?:        string
  readonly artifactDigest?: string
  readonly from?:           string
  readonly to?:             string
  readonly cursor?:         string
  readonly limit?:          number
}

export interface QuarantineRecordStore {
  append(record: PackageQuarantineRecord): Promise<void>
  getById(recordId: string): Promise<PackageQuarantineRecord | undefined>
  query(query: QuarantineRecordQuery): Promise<RepositoryPage<PackageQuarantineRecord>>
  getCurrentRevision(): RepositoryRevision
}
