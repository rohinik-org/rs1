import { createInMemoryTrustRecordStore } from './adapters/in-memory/trust-record-store.js'
import { createInMemoryQuarantineRecordStore } from './adapters/in-memory/quarantine-record-store.js'
import { createInMemoryTrustEventStore } from './adapters/in-memory/trust-event-store.js'
import { createRepositoryWriteCoordinator } from './repository-write-coordinator.js'
import type { QuarantineRecordQuery } from './ports/quarantine-record-store.js'
import { createTrustHistoryReader } from './trust-history-reader.js'
import { createCurrentTrustProjector } from './current-trust-projector.js'
import { createLineageManager } from './lineage-manager.js'
import { createSupersessionManager } from './supersession-manager.js'
import { createRepositoryIntegrityVerifier } from './repository-integrity-verifier.js'
import { createRetentionPolicyEvaluator } from './retention-policy-evaluator.js'
import type { TrustRecordStore } from './ports/trust-record-store.js'
import type { QuarantineRecordStore } from './ports/quarantine-record-store.js'
import type { TrustEventStore } from './ports/trust-event-store.js'
import type {
  RecordTrustDecisionCommand,
  RecordQuarantineResultCommand,
  AppendTrustEventCommand,
  RecordSupersessionCommand,
  GetCurrentPackageTrustQuery,
  GetPackageTrustHistoryQuery,
  GetTrustDecisionRecordQuery,
  GetPackageQuarantineStateQuery,
  FindReevaluationCandidatesQuery,
  GetProvisioningTrustSnapshotQuery,
  RepositoryWriteReceipt,
  QuarantineWriteReceipt,
  SupersessionReceipt,
  CurrentTrustState,
  ProvisioningTrustSnapshot,
  ReevaluationCandidate,
  RepositoryPage,
  IntegrityReport,
  RetentionMetadata,
  LineageRecord,
  RepositoryHealthStatus,
  PackageTrustDecisionRecord,
  PackageQuarantineRecord,
  RepositoryRevision,
  RepositoryRecordId,
} from './types.js'

export interface PackageTrustRepository {
  // Write
  recordTrustDecision(cmd: RecordTrustDecisionCommand): Promise<RepositoryWriteReceipt>
  recordQuarantineResult(cmd: RecordQuarantineResultCommand): Promise<QuarantineWriteReceipt>
  appendTrustEvent(cmd: AppendTrustEventCommand): Promise<void>
  recordSupersession(cmd: RecordSupersessionCommand): Promise<SupersessionReceipt>

  // Read — current state
  getCurrentTrust(query: GetCurrentPackageTrustQuery): Promise<CurrentTrustState>
  getTrustDecisionRecord(query: GetTrustDecisionRecordQuery): Promise<PackageTrustDecisionRecord | undefined>
  getQuarantineState(query: GetPackageQuarantineStateQuery): Promise<PackageQuarantineRecord | undefined>

  // Read — history
  getTrustHistory(query: GetPackageTrustHistoryQuery): Promise<RepositoryPage<PackageTrustDecisionRecord>>

  // Downstream queries
  findReevaluationCandidates(query: FindReevaluationCandidatesQuery): Promise<RepositoryPage<ReevaluationCandidate>>
  getProvisioningSnapshot(query: GetProvisioningTrustSnapshotQuery): Promise<ProvisioningTrustSnapshot>

  // Integrity & health
  verifyIntegrity(): Promise<IntegrityReport>
  getHealth(): RepositoryHealthStatus

  // Lineage
  getLineage(packageId: string, version: string, artifactDigest: string): LineageRecord | undefined

  // Retention
  evaluateRetention(recordId: RepositoryRecordId, evaluatedAt: string): Promise<RetentionMetadata>
}

export function createPackageTrustRepository(
  trustStore: TrustRecordStore,
  quarantineStore: QuarantineRecordStore,
  eventStore: TrustEventStore,
): PackageTrustRepository {
  const lineageManager = createLineageManager()
  const supersessionManager = createSupersessionManager()
  const writeCoordinator = createRepositoryWriteCoordinator(
    trustStore, quarantineStore, eventStore, supersessionManager, lineageManager,
  )
  const historyReader = createTrustHistoryReader(trustStore, quarantineStore)
  const supersededIds = () => new Set<string>(supersessionManager.getAllLinks().map(l => l.priorRecordId))
  const projector = createCurrentTrustProjector(trustStore, quarantineStore, supersededIds)
  const integrityVerifier = createRepositoryIntegrityVerifier(
    trustStore, quarantineStore, eventStore, () => supersessionManager.getAllLinks(),
  )
  const retentionEvaluator = createRetentionPolicyEvaluator()

  let health: RepositoryHealthStatus = { state: 'healthy', checkedAt: new Date().toISOString() }

  async function recordTrustDecision(cmd: RecordTrustDecisionCommand): Promise<RepositoryWriteReceipt> {
    return writeCoordinator.recordTrustDecision(cmd)
  }

  async function recordQuarantineResult(cmd: RecordQuarantineResultCommand): Promise<QuarantineWriteReceipt> {
    return writeCoordinator.recordQuarantineResult(cmd)
  }

  async function appendTrustEvent(cmd: AppendTrustEventCommand): Promise<void> {
    return writeCoordinator.appendTrustEvent(cmd)
  }

  async function recordSupersession(cmd: RecordSupersessionCommand): Promise<SupersessionReceipt> {
    return writeCoordinator.recordSupersession(cmd)
  }

  async function getCurrentTrust(query: GetCurrentPackageTrustQuery): Promise<CurrentTrustState> {
    return projector.getCurrent(query)
  }

  async function getTrustDecisionRecord(query: GetTrustDecisionRecordQuery): Promise<PackageTrustDecisionRecord | undefined> {
    return trustStore.getById(query.recordId)
  }

  async function getQuarantineState(query: GetPackageQuarantineStateQuery): Promise<PackageQuarantineRecord | undefined> {
    const asOf = query.asOf ?? new Date().toISOString()
    const qQuery: QuarantineRecordQuery = {
      packageId: query.packageId,
      ...(query.version !== undefined && { version: query.version }),
      ...(query.artifactDigest !== undefined && { artifactDigest: query.artifactDigest }),
    }
    const page = await quarantineStore.query(qQuery)
    const active = page.items.filter(r =>
      r.effectiveAt <= asOf &&
      !supersededIds().has(r.recordId),
    )
    if (active.length === 0) return undefined
    return active.sort((a, b) => b.effectiveAt.localeCompare(a.effectiveAt))[0]
  }

  async function getTrustHistory(query: GetPackageTrustHistoryQuery): Promise<RepositoryPage<PackageTrustDecisionRecord>> {
    return historyReader.readHistory(query)
  }

  async function findReevaluationCandidates(query: FindReevaluationCandidatesQuery): Promise<RepositoryPage<ReevaluationCandidate>> {
    const page = await trustStore.query({})
    const limit = query.limit ?? 50
    const olderThan = query.olderThan

    const candidates: ReevaluationCandidate[] = []
    for (const record of page.items) {
      if (supersededIds().has(record.recordId)) continue

      let matchedReason: string | undefined

      if (olderThan && record.effectiveAt < olderThan) {
        matchedReason = 'older-than'
      }

      if (!matchedReason && query.changedPolicyIds?.length) {
        if (query.changedPolicyIds.includes(record.policyReference.policyId)) {
          matchedReason = `policy-changed:${record.policyReference.policyId}`
        }
      }

      if (!matchedReason && query.changedAdvisoryIds?.length) {
        for (const ref of record.assessmentReferences) {
          if (query.changedAdvisoryIds.includes(ref.assessmentId)) {
            matchedReason = `advisory-changed:${ref.assessmentId}`
            break
          }
        }
      }

      if (!matchedReason && query.changedPublisherIds?.length) {
        const publisherId = record.subject.publisherIdentity?.publisherId
        if (publisherId && query.changedPublisherIds.includes(publisherId)) {
          matchedReason = `publisher-changed:${publisherId}`
        }
      }

      if (matchedReason) candidates.push({ record, matchedReason })
    }

    const slice = candidates.slice(0, limit)
    return { items: slice }
  }

  async function getProvisioningSnapshot(query: GetProvisioningTrustSnapshotQuery): Promise<ProvisioningTrustSnapshot> {
    const currentQueryBase: GetCurrentPackageTrustQuery = { packageId: query.packageId, asOf: query.asOf }
    const currentQuery: GetCurrentPackageTrustQuery = {
      ...currentQueryBase,
      ...(query.version !== undefined && { version: query.version }),
      ...(query.artifactDigest !== undefined && { artifactDigest: query.artifactDigest }),
      ...(query.tenantId !== undefined && { tenantId: query.tenantId }),
      ...(query.environmentId !== undefined && { environmentId: query.environmentId }),
    }

    const trustState = await projector.getCurrent(currentQuery)

    const supersessionState = trustState.record
      ? (supersededIds().has(trustState.record.recordId) ? 'superseded'
        : supersessionManager.getSuccessor(trustState.record.recordId) ? 'successor'
        : 'none')
      : 'none'

    const policyReferences = trustState.record ? [trustState.record.policyReference] : []

    const base: ProvisioningTrustSnapshot = {
      trustRevision:     trustStore.getCurrentRevision(),
      quarantineRevision: quarantineStore.getCurrentRevision(),
      policyReferences,
      supersessionState,
      repositoryHealth:  health.state,
      asOf:              query.asOf,
    }
    const withTrust = trustState.record !== undefined ? { ...base, trustDecisionRecord: trustState.record } : base
    const withQ = trustState.quarantineRecord !== undefined ? { ...withTrust, quarantineRecord: trustState.quarantineRecord } : withTrust
    return withQ
  }

  async function verifyIntegrity(): Promise<IntegrityReport> {
    const report = await integrityVerifier.verify()
    if (!report.valid) {
      const firstDetail = report.findings[0]?.detail
      if (firstDetail !== undefined) {
        health = { state: 'integrity-warning', checkedAt: report.checkedAt, details: firstDetail }
      } else {
        health = { state: 'integrity-warning', checkedAt: report.checkedAt }
      }
    }
    return report
  }

  function getHealth(): RepositoryHealthStatus {
    return health
  }

  function getLineage(packageId: string, version: string, artifactDigest: string): LineageRecord | undefined {
    return lineageManager.getLineage(packageId, version, artifactDigest)
  }

  async function evaluateRetentionRecord(recordId: RepositoryRecordId, evaluatedAt: string): Promise<RetentionMetadata> {
    const record = await trustStore.getById(recordId)
    if (!record) {
      const qRecord = await quarantineStore.getById(recordId)
      if (qRecord) return retentionEvaluator.evaluate(qRecord, evaluatedAt)
      return { recordId, classification: 'retain', evaluatedAt }
    }
    return retentionEvaluator.evaluate(record, evaluatedAt)
  }

  return {
    recordTrustDecision,
    recordQuarantineResult,
    appendTrustEvent,
    recordSupersession,
    getCurrentTrust,
    getTrustDecisionRecord,
    getQuarantineState,
    getTrustHistory,
    findReevaluationCandidates,
    getProvisioningSnapshot,
    verifyIntegrity,
    getHealth,
    getLineage,
    evaluateRetention: evaluateRetentionRecord,
  }
}

export function createInMemoryPackageTrustRepository(): PackageTrustRepository {
  return createPackageTrustRepository(
    createInMemoryTrustRecordStore(),
    createInMemoryQuarantineRecordStore(),
    createInMemoryTrustEventStore(),
  )
}
