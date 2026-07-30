import type { PackageQuarantineRecord, RepositoryPage, RepositoryRevision, CursorToken } from '../../types.js'
import type { QuarantineRecordStore, QuarantineRecordQuery } from '../../ports/quarantine-record-store.js'

export function createInMemoryQuarantineRecordStore(): QuarantineRecordStore {
  const records: PackageQuarantineRecord[] = []

  async function append(record: PackageQuarantineRecord): Promise<void> {
    records.push(record)
  }

  async function getById(recordId: string): Promise<PackageQuarantineRecord | undefined> {
    return records.find(r => r.recordId === recordId)
  }

  function matchesQuery(r: PackageQuarantineRecord, q: QuarantineRecordQuery): boolean {
    if (q.packageId && r.subject.packageId !== q.packageId) return false
    if (q.version && r.subject.version !== q.version) return false
    if (q.artifactDigest && r.artifactIdentity.artifactDigest !== q.artifactDigest) return false
    if (q.from && r.effectiveAt < q.from) return false
    if (q.to && r.effectiveAt > q.to) return false
    return true
  }

  async function query(q: QuarantineRecordQuery): Promise<RepositoryPage<PackageQuarantineRecord>> {
    const filtered = records.filter(r => matchesQuery(r, q))
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
