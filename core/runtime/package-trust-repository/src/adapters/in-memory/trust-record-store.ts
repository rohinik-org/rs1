import type {
  PackageTrustDecisionRecord,
  RepositoryWriteReceipt,
  RepositoryPage,
  RepositoryRevision,
  OperationId,
  RepositoryRecordId,
  CursorToken,
} from '../../types.js'
import type { TrustRecordStore, TrustRecordQuery } from '../../ports/trust-record-store.js'

export function createInMemoryTrustRecordStore(): TrustRecordStore {
  const records: PackageTrustDecisionRecord[] = []

  async function append(record: PackageTrustDecisionRecord): Promise<RepositoryWriteReceipt> {
    records.push(record)
    return {
      operationId: record.operationId,
      recordId:    record.recordId,
      revision:    record.repositoryRevision,
      recordedAt:  record.recordedAt,
      idempotent:  false,
    }
  }

  async function getById(recordId: string): Promise<PackageTrustDecisionRecord | undefined> {
    return records.find(r => r.recordId === recordId)
  }

  function matchesQuery(r: PackageTrustDecisionRecord, q: TrustRecordQuery): boolean {
    if (q.packageId && r.subject.packageId !== q.packageId) return false
    if (q.version && r.subject.version !== q.version) return false
    if (q.artifactDigest && r.artifactIdentity.artifactDigest !== q.artifactDigest) return false
    if (q.from && r.effectiveAt < q.from) return false
    if (q.to && r.effectiveAt > q.to) return false
    return true
  }

  function compare(a: PackageTrustDecisionRecord, b: PackageTrustDecisionRecord): number {
    const ea = a.effectiveAt.localeCompare(b.effectiveAt)
    if (ea !== 0) return ea
    const ra = a.recordedAt.localeCompare(b.recordedAt)
    if (ra !== 0) return ra
    const rv = a.repositoryRevision - b.repositoryRevision
    if (rv !== 0) return rv
    return a.recordId.localeCompare(b.recordId)
  }

  async function query(q: TrustRecordQuery): Promise<RepositoryPage<PackageTrustDecisionRecord>> {
    const filtered = records.filter(r => matchesQuery(r, q)).sort(compare)
    const limit = q.limit ?? filtered.length
    let offset = 0
    if (q.cursor) {
      const decoded = Buffer.from(q.cursor, 'base64url').toString()
      offset = parseInt(decoded.split(':')[0] ?? '0', 10)
    }
    const slice = filtered.slice(offset, offset + limit)
    const nextCursor = offset + limit < filtered.length
      ? Buffer.from(`${offset + limit}:stable`).toString('base64url') as CursorToken
      : undefined
    return nextCursor !== undefined
      ? { items: slice, nextCursor }
      : { items: slice }
  }

  function getCurrentRevision(): RepositoryRevision {
    if (records.length === 0) return 0 as RepositoryRevision
    return Math.max(...records.map(r => r.repositoryRevision)) as RepositoryRevision
  }

  return { append, getById, query, getCurrentRevision }
}
