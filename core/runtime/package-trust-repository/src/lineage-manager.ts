import type { LineageRecord, SupersessionLink, RepositoryRecordId } from './types.js'

export function createLineageManager() {
  // packageId:version:digest → LineageRecord
  const store = new Map<string, LineageRecord>()

  function key(packageId: string, version: string, artifactDigest: string): string {
    return `${encodeURIComponent(packageId)}:${encodeURIComponent(version)}:${encodeURIComponent(artifactDigest)}`
  }

  function ensureLineage(packageId: string, version: string, artifactDigest: string): LineageRecord {
    const k = key(packageId, version, artifactDigest)
    if (!store.has(k)) {
      store.set(k, { packageId, version, artifactDigest, trustDecisionIds: [], quarantineIds: [], supersessionLinks: [] })
    }
    return store.get(k)!
  }

  function recordTrustDecision(packageId: string, version: string, artifactDigest: string, recordId: RepositoryRecordId): void {
    const existing = ensureLineage(packageId, version, artifactDigest)
    if (!existing.trustDecisionIds.includes(recordId)) {
      store.set(key(packageId, version, artifactDigest), {
        ...existing,
        trustDecisionIds: [...existing.trustDecisionIds, recordId],
      })
    }
  }

  function recordQuarantine(packageId: string, version: string, artifactDigest: string, recordId: RepositoryRecordId): void {
    const existing = ensureLineage(packageId, version, artifactDigest)
    if (!existing.quarantineIds.includes(recordId)) {
      store.set(key(packageId, version, artifactDigest), {
        ...existing,
        quarantineIds: [...existing.quarantineIds, recordId],
      })
    }
  }

  function recordSupersession(packageId: string, version: string, artifactDigest: string, link: SupersessionLink): void {
    const existing = ensureLineage(packageId, version, artifactDigest)
    const alreadyExists = existing.supersessionLinks.some(
      l => l.priorRecordId === link.priorRecordId && l.successorRecordId === link.successorRecordId,
    )
    if (!alreadyExists) {
      store.set(key(packageId, version, artifactDigest), {
        ...existing,
        supersessionLinks: [...existing.supersessionLinks, link],
      })
    }
  }

  function getLineage(packageId: string, version: string, artifactDigest: string): LineageRecord | undefined {
    return store.get(key(packageId, version, artifactDigest))
  }

  return { recordTrustDecision, recordQuarantine, recordSupersession, getLineage }
}
