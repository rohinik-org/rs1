import type { PackageTrustSubject } from '@rohinik-org/package-trust-ir'
import type { ArtifactIdentity } from '@rohinik-org/package-trust-repository'
import type {
  PackageProvisioningTrustSnapshot,
  ProvisioningTrustSnapshotRequest,
  PackageQuarantineState,
  PackageTrustReevaluationStatus,
  PackageProvisioningAuthorizationRecord,
  AuthorizationWriteReceipt,
  AuthorizationTransitionCommand,
  PackageProvisioningAuthorizationEvent,
  ProvisioningAuthorizationLockHandle,
  AuthorizationLifecycleState,
} from '../../types.js'
import type {
  ProvisioningTrustRepositoryReader,
  ProvisioningQuarantineReader,
  ReevaluationStatusReader,
  ProvisioningAuthorizationRecordStore,
  ProvisioningAuthorizationLock,
  ProvisioningAuthorizationEventSink,
} from '../../ports/index.js'

export function createInMemoryTrustRepositoryReader(
  snapshots: PackageProvisioningTrustSnapshot[] = [],
): ProvisioningTrustRepositoryReader {
  return {
    async getProvisioningTrustSnapshot(req: ProvisioningTrustSnapshotRequest) {
      return snapshots.find(s =>
        s.subject.packageId === req.packageId &&
        s.subject.version === req.version &&
        s.artifactIdentity.artifactDigest === req.artifactDigest,
      )
    },
  }
}

export function createInMemoryQuarantineReader(
  defaultState: PackageQuarantineState = 'not-quarantined',
  overrides: Map<string, PackageQuarantineState> = new Map(),
): ProvisioningQuarantineReader {
  return {
    async getCurrentQuarantineState(subject: PackageTrustSubject, identity: ArtifactIdentity) {
      const key = `${subject.packageId}:${subject.version}:${identity.artifactDigest}`
      return overrides.get(key) ?? defaultState
    },
  }
}

export function createInMemoryReevaluationStatusReader(
  defaultState: PackageTrustReevaluationStatus = {
    trustDecisionRecordId: '',
    state: 'not-required',
    asOf: new Date(0).toISOString(),
  },
  overrides: Map<string, PackageTrustReevaluationStatus> = new Map(),
): ReevaluationStatusReader {
  return {
    async getCurrentReevaluationStatus(recordId: string, asOf: string) {
      return overrides.get(recordId) ?? { ...defaultState, trustDecisionRecordId: recordId, asOf }
    },
  }
}

export function createInMemoryAuthorizationRecordStore(): ProvisioningAuthorizationRecordStore & {
  getAll(): PackageProvisioningAuthorizationRecord[]
} {
  const byId    = new Map<string, PackageProvisioningAuthorizationRecord>()
  const byOp    = new Map<string, PackageProvisioningAuthorizationRecord>()
  const byReq   = new Map<string, PackageProvisioningAuthorizationRecord>()
  const events: PackageProvisioningAuthorizationEvent[] = []

  return {
    async append(record: PackageProvisioningAuthorizationRecord) {
      byId.set(record.authorizationId, record)
      byOp.set(record.operationId, record)
      byReq.set(record.requestId, record)
      return { authorizationId: record.authorizationId, operationId: record.operationId, state: record.state, recordedAt: record.issuedAt }
    },
    async getById(id: string) { return byId.get(id) },
    async getByOperationId(opId: string) { return byOp.get(opId) },
    async getByRequestId(reqId: string) { return byReq.get(reqId) },
    async transition(cmd: AuthorizationTransitionCommand) {
      const existing = byId.get(cmd.authorizationId)
      if (!existing) throw new Error(`Authorization record not found: ${cmd.authorizationId}`)
      const updated: PackageProvisioningAuthorizationRecord = {
        ...existing,
        state: cmd.toState,
        ...(cmd.toState === 'CONSUMED' && cmd.consumedByOperationId !== undefined && {
          consumedAt: cmd.transitionedAt,
          consumedByOperationId: cmd.consumedByOperationId,
          ...(cmd.tokenDigest !== undefined && { tokenDigest: cmd.tokenDigest }),
        }),
        ...(cmd.toState === 'INVALIDATED' && {
          invalidatedAt: cmd.transitionedAt,
          invalidationReason: cmd.reason,
        }),
        ...(cmd.toState === 'SUPERSEDED' && {
          invalidatedAt: cmd.transitionedAt,
          invalidationReason: cmd.reason,
        }),
      }
      byId.set(updated.authorizationId, updated)
      byOp.set(updated.operationId, updated)
      byReq.set(updated.requestId, updated)
      return { authorizationId: updated.authorizationId, operationId: updated.operationId, state: updated.state, recordedAt: cmd.transitionedAt }
    },
    getAll() { return [...byId.values()] },
  }
}

export function createInMemoryAuthorizationLock(): ProvisioningAuthorizationLock {
  const held = new Set<string>()
  return {
    async acquire(key: string): Promise<ProvisioningAuthorizationLockHandle> {
      if (held.has(key)) {
        // ponytail: spin-wait stub; real impl would queue
        throw new Error(`Lock already held: ${key}`)
      }
      held.add(key)
      return { key, release() { held.delete(key) } }
    },
  }
}

export function createInMemoryEventSink(): ProvisioningAuthorizationEventSink & {
  events: PackageProvisioningAuthorizationEvent[]
} {
  const events: PackageProvisioningAuthorizationEvent[] = []
  return {
    events,
    async publish(event: PackageProvisioningAuthorizationEvent) { events.push(event) },
  }
}
