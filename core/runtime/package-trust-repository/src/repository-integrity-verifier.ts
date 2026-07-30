import { computeRecordDigest } from './record-digest-computer.js'
import type { TrustRecordStore } from './ports/trust-record-store.js'
import type { QuarantineRecordStore } from './ports/quarantine-record-store.js'
import type { TrustEventStore } from './ports/trust-event-store.js'
import type { IntegrityReport, IntegrityFinding, RepositoryRecordId } from './types.js'

const SCHEMA_VERSION = '1.0'

export function createRepositoryIntegrityVerifier(
  trustStore: TrustRecordStore,
  quarantineStore: QuarantineRecordStore,
  eventStore: TrustEventStore,
  supersessionLinks: () => readonly { priorRecordId: string; successorRecordId: string }[],
) {
  async function verify(): Promise<IntegrityReport> {
    const findings: IntegrityFinding[] = []
    const checkedAt = new Date().toISOString()

    // Verify trust record digests
    const trustPage = await trustStore.query({})
    for (const record of trustPage.items) {
      const { canonicalDigest, ...rest } = record
      const expected = computeRecordDigest(SCHEMA_VERSION, 'PackageTrustDecisionRecord', rest)
      if (expected !== canonicalDigest) {
        findings.push({ kind: 'digest-mismatch', recordId: record.recordId as RepositoryRecordId, detail: `Trust record ${record.recordId} digest mismatch` })
      }
    }

    // Verify quarantine record digests
    const qPage = await quarantineStore.query({})
    for (const record of qPage.items) {
      const { canonicalDigest, ...rest } = record
      const expected = computeRecordDigest(SCHEMA_VERSION, 'PackageQuarantineRecord', rest)
      if (expected !== canonicalDigest) {
        findings.push({ kind: 'digest-mismatch', recordId: record.recordId as RepositoryRecordId, detail: `Quarantine record ${record.recordId} digest mismatch` })
      }
      // Referential integrity: trustDecisionRecordId must exist
      const ref = await trustStore.getById(record.trustDecisionRecordId)
      if (!ref) {
        findings.push({ kind: 'missing-reference', recordId: record.recordId as RepositoryRecordId, detail: `Quarantine record ${record.recordId} references missing trust decision ${record.trustDecisionRecordId}` })
      }
    }

    // Detect supersession cycles (BFS from each prior)
    const links = supersessionLinks()
    const successorMap = new Map(links.map(l => [l.priorRecordId, l.successorRecordId]))
    for (const link of links) {
      const visited = new Set<string>()
      let cur: string | undefined = link.successorRecordId
      while (cur) {
        if (visited.has(cur)) {
          findings.push({ kind: 'supersession-cycle', detail: `Cycle detected starting at ${link.priorRecordId}` })
          break
        }
        visited.add(cur)
        cur = successorMap.get(cur)
      }
    }

    // Verify revisions are monotone
    const revisions = trustPage.items.map(r => r.repositoryRevision).sort((a, b) => a - b)
    for (let i = 1; i < revisions.length; i++) {
      if (revisions[i] === revisions[i - 1]) {
        findings.push({ kind: 'duplicate-revision', detail: `Duplicate revision ${revisions[i]}` })
      }
    }

    return { valid: findings.length === 0, findings, checkedAt }
  }

  return { verify }
}
