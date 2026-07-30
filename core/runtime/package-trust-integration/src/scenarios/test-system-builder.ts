/**
 * Integration harness wiring utility — builds a complete Stage 9J system
 * from in-memory adapters exposed by each task's public contract.
 */
import {
  createInMemoryPackageTrustRepository,
} from '@rohinik-org/package-trust-repository'
import {
  QuarantineController,
  InMemoryArtifactStorage,
  InMemoryQuarantineStorage,
  InMemoryQuarantineLock,
  InMemoryQuarantineEventSink,
} from '@rohinik-org/package-quarantine'
import {
  ReevaluationController,
  InMemoryTrustRepositoryReader,
  InMemoryTrustRepositoryWriter,
  InMemoryTrustPipeline,
  InMemoryQuarantineService,
  InMemoryReevaluationLock,
  InMemoryReevaluationEventSink,
} from '@rohinik-org/package-trust-reevaluation'
import {
  createAuthorizationController,
  createInMemoryTrustRepositoryReader,
  createInMemoryQuarantineReader,
  createInMemoryReevaluationStatusReader,
  createInMemoryAuthorizationRecordStore,
  createInMemoryAuthorizationLock,
  createInMemoryEventSink,
} from '@rohinik-org/package-provisioning-authorization'
import type { PackageProvisioningTrustSnapshot } from '@rohinik-org/package-provisioning-authorization'
import { Stage9JSystemHarness } from '../stage-9j-system-harness.js'

export interface Stage9JTestSystem {
  harness: Stage9JSystemHarness
  quarantineEventSink: InMemoryQuarantineEventSink
  reevalEventSink: InMemoryReevaluationEventSink
  reevalPipeline: InMemoryTrustPipeline
  reevalRepositoryReader: InMemoryTrustRepositoryReader
  reevalRepositoryWriter: InMemoryTrustRepositoryWriter
  authEventSink: ReturnType<typeof createInMemoryEventSink>
  authRecordStore: ReturnType<typeof createInMemoryAuthorizationRecordStore>
}

export function buildStage9JTestSystem(
  snapshots: PackageProvisioningTrustSnapshot[] = [],
): Stage9JTestSystem {
  // Task 12 — repository
  const repository = createInMemoryPackageTrustRepository()

  // Task 11 — quarantine
  const artifactStorage = new InMemoryArtifactStorage()
  const quarantineStorage = new InMemoryQuarantineStorage()
  const quarantineLock = new InMemoryQuarantineLock()
  const quarantineEventSink = new InMemoryQuarantineEventSink()
  const quarantineController = new QuarantineController(
    artifactStorage, quarantineStorage, quarantineLock, quarantineEventSink,
  )

  // Task 13 — reevaluation
  const reevalRepositoryReader = new InMemoryTrustRepositoryReader()
  const reevalRepositoryWriter = new InMemoryTrustRepositoryWriter()
  const reevalPipeline = new InMemoryTrustPipeline()
  const reevalQuarantineService = new InMemoryQuarantineService()
  const reevalLock = new InMemoryReevaluationLock()
  const reevalEventSink = new InMemoryReevaluationEventSink()
  const reevaluationController = new ReevaluationController({
    reader: reevalRepositoryReader,
    writer: reevalRepositoryWriter,
    pipeline: reevalPipeline,
    quarantineService: reevalQuarantineService,
    lock: reevalLock,
    eventSink: reevalEventSink,
  })

  // Task 14 — provisioning authorization
  const trustReader = createInMemoryTrustRepositoryReader(snapshots)
  const quarantineReader = createInMemoryQuarantineReader('not-quarantined')
  const reevalReader = createInMemoryReevaluationStatusReader()
  const authRecordStore = createInMemoryAuthorizationRecordStore()
  const authLock = createInMemoryAuthorizationLock()
  const authEventSink = createInMemoryEventSink()
  const authorizationController = createAuthorizationController(
    trustReader, quarantineReader, reevalReader, authRecordStore, authLock, authEventSink,
  )

  const harness = new Stage9JSystemHarness({
    repository,
    quarantineController,
    reevaluationController,
    authorizationController,
  })

  return {
    harness,
    quarantineEventSink,
    reevalEventSink,
    reevalPipeline,
    reevalRepositoryReader,
    reevalRepositoryWriter,
    authEventSink,
    authRecordStore,
  }
}
