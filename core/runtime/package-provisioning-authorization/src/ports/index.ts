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
} from '../types.js'

export interface ProvisioningTrustRepositoryReader {
  getProvisioningTrustSnapshot(
    request: ProvisioningTrustSnapshotRequest,
  ): Promise<PackageProvisioningTrustSnapshot | undefined>
}

export interface ProvisioningQuarantineReader {
  getCurrentQuarantineState(
    subject: PackageTrustSubject,
    artifactIdentity: ArtifactIdentity,
    asOf: string,
  ): Promise<PackageQuarantineState>
}

export interface ReevaluationStatusReader {
  getCurrentReevaluationStatus(
    trustDecisionRecordId: string,
    asOf: string,
  ): Promise<PackageTrustReevaluationStatus>
}

export interface ProvisioningAuthorizationRecordStore {
  append(record: PackageProvisioningAuthorizationRecord): Promise<AuthorizationWriteReceipt>
  getById(authorizationId: string): Promise<PackageProvisioningAuthorizationRecord | undefined>
  getByOperationId(operationId: string): Promise<PackageProvisioningAuthorizationRecord | undefined>
  getByRequestId(requestId: string): Promise<PackageProvisioningAuthorizationRecord | undefined>
  transition(command: AuthorizationTransitionCommand): Promise<AuthorizationWriteReceipt>
}

export interface ProvisioningAuthorizationLock {
  acquire(key: string): Promise<ProvisioningAuthorizationLockHandle>
}

export interface ProvisioningAuthorizationEventSink {
  publish(event: PackageProvisioningAuthorizationEvent): Promise<void>
}
