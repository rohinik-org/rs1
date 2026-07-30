export type {
  PackageTrustRepository,
} from './package-trust-repository.js'
export { createPackageTrustRepository, createInMemoryPackageTrustRepository } from './package-trust-repository.js'

export type {
  ArtifactIdentity,
  PolicyReference,
  EvidenceReference,
  AssessmentReference,
  SupersessionReason,
  PackageTrustDecisionRecord,
  PackageQuarantineRecord,
  QuarantineResultPayload,
  PackageTrustEventType,
  PackageTrustEventRecord,
  RepositoryRecordEnvelope,
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
  RepositoryPage,
  CurrentTrustState,
  ProvisioningTrustSnapshot,
  ReevaluationCandidate,
  RepositoryWriteReceipt,
  QuarantineWriteReceipt,
  SupersessionReceipt,
  RepositoryHealthState,
  RepositoryHealthStatus,
  RetentionClassification,
  RetentionMetadata,
  IntegrityFinding,
  IntegrityReport,
  SupersessionLink,
  WriteConflictKind,
  LineageRecord,
  RepositoryBackup,
  RepositoryClock,
  RepositoryRecordId,
  OperationId,
  RepositoryRevision,
  PartitionKey,
  CursorToken,
} from './types.js'
export { RepositoryWriteConflict } from './types.js'

export { createInMemoryTrustRecordStore, createInMemoryQuarantineRecordStore, createInMemoryTrustEventStore } from './adapters/in-memory/index.js'
export type { TrustRecordStore, TrustRecordQuery } from './ports/trust-record-store.js'
export type { QuarantineRecordStore, QuarantineRecordQuery } from './ports/quarantine-record-store.js'
export type { TrustEventStore, TrustEventQuery } from './ports/trust-event-store.js'
export type { RepositoryTransaction } from './ports/repository-transaction.js'
export type { RepositoryLock, RepositoryLockHandle } from './ports/repository-lock.js'
