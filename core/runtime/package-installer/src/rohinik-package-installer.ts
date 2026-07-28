import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { randomUUID } from 'node:crypto'
import type {
  AuthorizedInstallRohinikPackageAction,
  VerifiedArtifactAuthorization,
  ProvisioningWorkspace,
  MutationJournalPort,
  PackageInstallPort,
  PackageInstallResult,
  ProvisioningMutationId,
  ArtifactFetchPort,
  ArtifactDigestMatchPort,
  ProvisioningOperation,
  QuarantinedArtifactHandle,
  QuarantinedArtifactRecord,
  ProvisioningDiagnosticCode,
  ProvisioningDiagnosticId,
  IsoTimestamp,
  AuthorizedCompensationDefinition,
} from '@rohinik-org/provisioning-ir'
import { ArtifactDigestMismatchError } from '@rohinik-org/provisioning-ir'
import type { QuarantineStore } from './quarantine-store.js'
import type { SafeWorkspace } from './safe-workspace.js'

export class RohinikPackageInstaller implements PackageInstallPort {
  constructor(
    private readonly fetcher: ArtifactFetchPort,
    private readonly digestMatcher: ArtifactDigestMatchPort,
    private readonly quarantineStore: QuarantineStore,
    private readonly safeWorkspace: SafeWorkspace,
    private readonly clock: () => IsoTimestamp,
  ) {}

  async install(
    action: AuthorizedInstallRohinikPackageAction,
    authorization: VerifiedArtifactAuthorization,
    workspace: ProvisioningWorkspace,
    journal: MutationJournalPort,
  ): Promise<PackageInstallResult> {
    const operation: ProvisioningOperation = {
      kind: 'install-rohinik-package',
      targetId: action.packageId as string,
    }

    // ── Phase 1: fetch mutation ───────────────────────────────────────────────
    const m1Id = randomUUID() as ProvisioningMutationId
    const writeHandle = this.quarantineStore.createWriteHandle(action.artifactAuthorizationId)

    // Resolve quarantine path to absolute so fetcher can write to it
    await this.quarantineStore.ensureQuarantineDirExists()
    const absoluteQuarantinePath = this.quarantineStore.resolveQuarantinePath(writeHandle)
    const absoluteWriteHandle = {
      quarantinePath: absoluteQuarantinePath as unknown as import('@rohinik-org/provisioning-ir').QuarantinePath,
      artifactAuthorizationId: writeHandle.artifactAuthorizationId,
    }

    const m1Classification: AuthorizedCompensationDefinition = {
      kind: 'delete-quarantine-path',
      parameters: { path: absoluteQuarantinePath },
    }

    journal.prepareMutation(action.actionId, m1Id, operation, m1Classification)
    journal.startMutation(action.actionId, m1Id, operation)

    let quarantineHandle: QuarantinedArtifactHandle
    try {
      const fetchResult = await this.fetcher.fetch(authorization.source, absoluteWriteHandle)
      quarantineHandle = fetchResult.quarantineHandle
    } catch (err) {
      journal.recordFailure(
        action.actionId,
        m1Id,
        operation,
        [] as readonly ProvisioningDiagnosticCode[],
        [] as readonly ProvisioningDiagnosticId[],
      )
      throw err
    }

    journal.recordSuccess(action.actionId, m1Id, operation, {
      kind: 'delete-quarantine-path',
      parameters: { path: absoluteQuarantinePath },
    })

    // ── Phase 2: digest validation (non-mutating) ─────────────────────────────
    journal.recordValidationStarted(action.actionId, m1Id, 'digest-match')

    const matchResult = await this.digestMatcher.matchFile(quarantineHandle, authorization)

    if (!matchResult.matched) {
      // Determine retention policy (from the action if present, default retain-until-cleanup)
      const retentionPolicy = action.quarantineRetentionPolicy

      const diagCodes: readonly ProvisioningDiagnosticCode[] = []
      const diagIds: readonly ProvisioningDiagnosticId[] = [matchResult.diagnosticId]

      if (retentionPolicy === 'delete-on-validation-failure') {
        // Delete quarantine file, pass undefined quarantineRecord
        journal.recordValidationFailed(action.actionId, m1Id, 'digest-match', diagCodes, diagIds, undefined)
        await fs.unlink(absoluteQuarantinePath)
        throw new ArtifactDigestMismatchError(
          matchResult.diagnosticId,
          action.artifactAuthorizationId,
          `Artifact digest mismatch for ${action.artifactAuthorizationId as string}`,
        )
      } else {
        // retain-until-cleanup: build quarantine record, include in val-fail
        const quarantineRecord: QuarantinedArtifactRecord = {
          diagnosticId: matchResult.diagnosticId,
          artifactAuthorizationId: authorization.artifactAuthorizationId,
          quarantineHandle,
          reason: 'digest-mismatch',
          retentionPolicy: 'retain-until-cleanup',
          quarantinedAt: this.clock(),
        }
        journal.recordValidationFailed(action.actionId, m1Id, 'digest-match', diagCodes, diagIds, quarantineRecord)
        throw new ArtifactDigestMismatchError(
          matchResult.diagnosticId,
          action.artifactAuthorizationId,
          `Artifact digest mismatch for ${action.artifactAuthorizationId as string}`,
        )
      }
    }

    journal.recordValidationSucceeded(action.actionId, m1Id, 'digest-match')

    // ── Phase 3: staging mutation ─────────────────────────────────────────────
    const m2Id = randomUUID() as ProvisioningMutationId
    const stagingDir = path.join(workspace.stagingRoot as string, `${action.packageId as string}-${action.version}`)
    const absoluteStagingDir = this.safeWorkspace.resolveNewPath(stagingDir as import('@rohinik-org/provisioning-ir').StagingRelativePath)

    const m2Classification: AuthorizedCompensationDefinition = {
      kind: 'delete-staging-path',
      parameters: { path: stagingDir },
    }

    journal.prepareMutation(action.actionId, m2Id, operation, m2Classification)
    journal.startMutation(action.actionId, m2Id, operation)

    await fs.mkdir(absoluteStagingDir, { recursive: true })
    const stagedFilePath = path.join(absoluteStagingDir, path.basename(absoluteQuarantinePath))
    await fs.copyFile(absoluteQuarantinePath, stagedFilePath)
    await fs.unlink(absoluteQuarantinePath)

    journal.recordSuccess(action.actionId, m2Id, operation, {
      kind: 'delete-staging-path',
      parameters: { path: stagingDir },
    })

    // ── Phase 4: finalization mutation ────────────────────────────────────────
    const m3Id = randomUUID() as ProvisioningMutationId
    const packageStorePath = action.destination as string

    const m3Classification: AuthorizedCompensationDefinition = {
      kind: 'remove-package-store-dir',
      parameters: { path: packageStorePath },
    }

    journal.prepareMutation(action.actionId, m3Id, operation, m3Classification)
    journal.startMutation(action.actionId, m3Id, operation)

    // Ensure parent of destination exists
    await fs.mkdir(path.dirname(packageStorePath), { recursive: true })
    // Atomic rename: staging dir → packageStorePath
    await fs.rename(absoluteStagingDir, packageStorePath)

    journal.recordSuccess(action.actionId, m3Id, operation, {
      kind: 'remove-package-store-dir',
      parameters: { path: packageStorePath },
    })

    return {
      installedPath: action.destination,
    }
  }
}
