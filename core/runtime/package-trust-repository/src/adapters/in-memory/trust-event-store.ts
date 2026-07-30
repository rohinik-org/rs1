import type { PackageTrustEventRecord, RepositoryPage, CursorToken } from '../../types.js'
import type { TrustEventStore, TrustEventQuery } from '../../ports/trust-event-store.js'

export function createInMemoryTrustEventStore(): TrustEventStore {
  const events: PackageTrustEventRecord[] = []

  async function append(event: PackageTrustEventRecord): Promise<void> {
    events.push(event)
  }

  async function query(q: TrustEventQuery): Promise<RepositoryPage<PackageTrustEventRecord>> {
    let filtered = events
    if (q.subject) {
      filtered = filtered.filter(e => e.subject.packageId === q.subject!.packageId && (!q.subject!.version || e.subject.version === q.subject!.version))
    }
    if (q.eventType) {
      filtered = filtered.filter(e => e.eventType === q.eventType)
    }
    if (q.from) filtered = filtered.filter(e => e.occurredAt >= q.from!)
    if (q.to)   filtered = filtered.filter(e => e.occurredAt <= q.to!)

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

  function getAll(): readonly PackageTrustEventRecord[] {
    return events
  }

  return { append, query, getAll } as TrustEventStore & { getAll(): readonly PackageTrustEventRecord[] }
}
