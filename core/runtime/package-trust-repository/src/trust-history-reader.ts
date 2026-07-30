import type { TrustRecordStore } from './ports/trust-record-store.js'
import type { TrustRecordQuery } from './ports/trust-record-store.js'
import type { QuarantineRecordStore } from './ports/quarantine-record-store.js'
import type { QuarantineRecordQuery } from './ports/quarantine-record-store.js'
import type {
  PackageTrustDecisionRecord,
  PackageQuarantineRecord,
  GetPackageTrustHistoryQuery,
  RepositoryPage,
  CursorToken,
} from './types.js'

function matchesQuery(record: PackageTrustDecisionRecord, q: GetPackageTrustHistoryQuery): boolean {
  if (q.packageId && record.subject.packageId !== q.packageId) return false
  if (q.version && record.subject.version !== q.version) return false
  if (q.artifactDigest && record.artifactIdentity.artifactDigest !== q.artifactDigest) return false
  if (q.from && record.effectiveAt < q.from) return false
  if (q.to && record.effectiveAt > q.to) return false
  return true
}

function compareRecords(a: PackageTrustDecisionRecord, b: PackageTrustDecisionRecord): number {
  const ea = a.effectiveAt.localeCompare(b.effectiveAt)
  if (ea !== 0) return ea
  const ra = a.recordedAt.localeCompare(b.recordedAt)
  if (ra !== 0) return ra
  const rv = a.repositoryRevision - b.repositoryRevision
  if (rv !== 0) return rv
  return a.recordId.localeCompare(b.recordId)
}

export function createTrustHistoryReader(
  trustStore: TrustRecordStore,
  _quarantineStore: QuarantineRecordStore,
) {
  async function readHistory(query: GetPackageTrustHistoryQuery): Promise<RepositoryPage<PackageTrustDecisionRecord>> {
    const storeQuery: TrustRecordQuery = {
      packageId: query.packageId,
      ...(query.version !== undefined && { version: query.version }),
      ...(query.artifactDigest !== undefined && { artifactDigest: query.artifactDigest }),
      ...(query.from !== undefined && { from: query.from }),
      ...(query.to !== undefined && { to: query.to }),
    }

    const page = await trustStore.query(storeQuery)
    const filtered = page.items.filter(r => matchesQuery(r, query))
    const sorted = [...filtered].sort(compareRecords)

    const limit = query.limit ?? 50
    let offset = 0
    if (query.cursor) {
      const decoded = Buffer.from(query.cursor as string, 'base64url').toString()
      const parts = decoded.split(':')
      offset = parseInt(parts[0] ?? '0', 10)
    }
    const slice = sorted.slice(offset, offset + limit)
    const nextCursor = offset + limit < sorted.length
      ? Buffer.from(`${offset + limit}:stable`).toString('base64url') as CursorToken
      : undefined

    return nextCursor !== undefined
      ? { items: slice, nextCursor }
      : { items: slice }
  }

  async function getQuarantineHistory(query: { packageId: string; version?: string; artifactDigest?: string }): Promise<RepositoryPage<PackageQuarantineRecord>> {
    const q: QuarantineRecordQuery = {
      packageId: query.packageId,
      ...(query.version !== undefined && { version: query.version }),
      ...(query.artifactDigest !== undefined && { artifactDigest: query.artifactDigest }),
    }
    return _quarantineStore.query(q)
  }

  return { readHistory, getQuarantineHistory }
}
