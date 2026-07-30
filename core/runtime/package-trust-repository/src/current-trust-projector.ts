import type { TrustRecordStore } from './ports/trust-record-store.js'
import type { TrustRecordQuery } from './ports/trust-record-store.js'
import type { QuarantineRecordStore } from './ports/quarantine-record-store.js'
import type { QuarantineRecordQuery } from './ports/quarantine-record-store.js'
import type {
  PackageTrustDecisionRecord,
  PackageQuarantineRecord,
  GetCurrentPackageTrustQuery,
  CurrentTrustState,
  RepositoryRevision,
} from './types.js'

export function createCurrentTrustProjector(
  trustStore: TrustRecordStore,
  quarantineStore: QuarantineRecordStore,
  supersededIds: () => ReadonlySet<string>,
) {
  async function getCurrent(query: GetCurrentPackageTrustQuery): Promise<CurrentTrustState> {
    const asOf = query.asOf ?? new Date().toISOString()
    const storeQuery: TrustRecordQuery = {
      packageId: query.packageId,
      ...(query.version !== undefined && { version: query.version }),
      ...(query.artifactDigest !== undefined && { artifactDigest: query.artifactDigest }),
    }

    const page = await trustStore.query(storeQuery)

    const candidates = page.items.filter(r =>
      !supersededIds().has(r.recordId) &&
      r.effectiveAt <= asOf &&
      (query.version === undefined || r.subject.version === query.version) &&
      (query.artifactDigest === undefined || r.artifactIdentity.artifactDigest === query.artifactDigest),
    )

    let current: PackageTrustDecisionRecord | undefined
    for (const r of candidates) {
      if (!current ||
        r.effectiveAt > current.effectiveAt ||
        (r.effectiveAt === current.effectiveAt && r.recordedAt > current.recordedAt) ||
        (r.effectiveAt === current.effectiveAt && r.recordedAt === current.recordedAt && r.repositoryRevision > current.repositoryRevision)) {
        current = r
      }
    }

    let qCurrent: PackageQuarantineRecord | undefined
    if (current !== undefined) {
      const qQuery: QuarantineRecordQuery = {
        packageId: query.packageId,
        ...(query.version !== undefined && { version: query.version }),
        ...(query.artifactDigest !== undefined && { artifactDigest: query.artifactDigest }),
      }
      const qPage = await quarantineStore.query(qQuery)
      qCurrent = qPage.items.find(q =>
        q.trustDecisionRecordId === current!.recordId &&
        q.effectiveAt <= asOf &&
        !supersededIds().has(q.recordId),
      )
    }

    const base: CurrentTrustState = {
      repositoryRevision: trustStore.getCurrentRevision() as RepositoryRevision,
      asOf,
    }
    const withRecord = current !== undefined ? { ...base, record: current } : base
    const withQuarantine = qCurrent !== undefined ? { ...withRecord, quarantineRecord: qCurrent } : withRecord
    return withQuarantine
  }

  async function rebuildFromHistory(packageId: string): Promise<CurrentTrustState> {
    return getCurrent({ packageId })
  }

  return { getCurrent, rebuildFromHistory }
}
