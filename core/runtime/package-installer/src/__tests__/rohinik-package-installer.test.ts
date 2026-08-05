import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { randomUUID } from 'node:crypto'
import { RohinikPackageInstaller } from '../rohinik-package-installer.js'
import { QuarantineStore } from '../quarantine-store.js'
import { SafeWorkspace } from '../safe-workspace.js'
import type {
  AuthorizedInstallRohinikPackageAction,
  VerifiedArtifactAuthorization,
  ProvisioningWorkspace,
  MutationJournalPort,
  ArtifactFetchPort,
  ArtifactDigestMatchPort,
  ArtifactFetchPort as FetchPort,
  ArtifactMatchResult,
  FetchResult,
  ProvisioningMutationId,
  ProvisioningActionId,
  ProvisioningOperation,
  ProvisioningDiagnosticCode,
  ProvisioningDiagnosticId,
  QuarantinedArtifactRecord,
  AuthorizedCompensationDefinition,
  InstantiatedCompensationRecord,
  AuthorizationId,
  ArtifactAuthorizationId,
  PackageStoreLocation,
  QuarantinedArtifactHandle,
  QuarantineWriteHandle,
  IsoTimestamp,
} from '@rohinik-org/provisioning-ir'
import { ArtifactDigestMismatchError } from '@rohinik-org/provisioning-ir'

// ── helpers ────────────────────────────────────────────────────────────────────

function isoNow(): IsoTimestamp {
  return new Date().toISOString() as IsoTimestamp
}

function makeAction(
  packageId = 'test-pkg',
  version = '1.0.0',
  destination: string = '/fake/store/test-pkg-1.0.0',
): AuthorizedInstallRohinikPackageAction {
  return {
    kind: 'install-rohinik-package',
    actionId: 'action-1' as ProvisioningActionId,
    dependsOn: [],
    packageId: packageId as import('@rohinik-org/provisioning-ir').PackageId,
    version,
    artifactAuthorizationId: 'aai-test' as ArtifactAuthorizationId,
    destination: destination as PackageStoreLocation,
    authorization: {
      authorizationId: 'auth-1' as AuthorizationId,
      authorizationDecisionId: 'decision-1' as import('@rohinik-org/provisioning-ir').AuthorizationDecisionId,
      authorizedTargetHash: 'hash-1',
    },
    mutationPolicy: {
      mutating: true,
      compensation: {
        kind: 'remove-package-store-dir',
        parameters: { path: destination },
      } as AuthorizedCompensationDefinition,
    },
    quarantineRetentionPolicy: 'retain-until-cleanup',
  }
}

function makeAuthorization(authId = 'aai-test'): VerifiedArtifactAuthorization {
  return {
    artifactAuthorizationId: authId as ArtifactAuthorizationId,
    artifact: {
      kind: 'rohinik-package',
      packageId: 'test-pkg' as import('@rohinik-org/provisioning-ir').PackageId,
      version: '1.0.0',
    },
    digest: { algorithm: 'sha256', encoding: 'hex', value: 'abc123' },
    source: { sourceKind: 'uri', uri: 'https://example.com/test-pkg.rpk' },
    authorizedBy: 'auth-1' as AuthorizationId,
  }
}

type JournalCall =
  | { type: 'prepare'; mutationId: string; classification: AuthorizedCompensationDefinition | { kind: 'non-compensable'; approvedReasonCode: string } }
  | { type: 'start'; mutationId: string }
  | { type: 'success'; mutationId: string; instantiated: InstantiatedCompensationRecord | undefined }
  | { type: 'fail'; mutationId: string }
  | { type: 'val-start'; validationKind: string; mutationId: string }
  | { type: 'val-success'; validationKind: string; mutationId: string }
  | { type: 'val-fail'; validationKind: string; mutationId: string; quarantineRecord: QuarantinedArtifactRecord | undefined }

function makeJournal(): { journal: MutationJournalPort; calls: JournalCall[] } {
  const calls: JournalCall[] = []
  const journal: MutationJournalPort = {
    prepareMutation(actionId, mutationId, operation, classification) {
      calls.push({ type: 'prepare', mutationId: mutationId as string, classification })
    },
    startMutation(actionId, mutationId, operation) {
      calls.push({ type: 'start', mutationId: mutationId as string })
    },
    recordSuccess(actionId, mutationId, operation, instantiated) {
      calls.push({ type: 'success', mutationId: mutationId as string, instantiated })
    },
    recordFailure(actionId, mutationId, operation, codes, ids) {
      calls.push({ type: 'fail', mutationId: mutationId as string })
    },
    recordValidationStarted(actionId, mutationId, validationKind) {
      calls.push({ type: 'val-start', validationKind, mutationId: mutationId as string })
    },
    recordValidationSucceeded(actionId, mutationId, validationKind) {
      calls.push({ type: 'val-success', validationKind, mutationId: mutationId as string })
    },
    recordValidationFailed(actionId, mutationId, validationKind, codes, ids, quarantineRecord) {
      calls.push({ type: 'val-fail', validationKind, mutationId: mutationId as string, quarantineRecord })
    },
  }
  return { journal, calls }
}

// Mock fetcher that writes a small file to the quarantine handle destination
function makeFetcher(succeed = true): ArtifactFetchPort {
  return {
    async fetch(source, destination) {
      if (!succeed) throw new Error('Fetch failed')
      const destPath = destination.quarantinePath as string
      await fs.writeFile(destPath, Buffer.from('fake-package-content'))
      const result: FetchResult = {
        bytesWritten: 20,
        quarantineHandle: {
          quarantinePath: destination.quarantinePath,
          artifactAuthorizationId: destination.artifactAuthorizationId,
        },
        effectiveSource: source,
      }
      return result
    },
  }
}

// Mock digest matcher
function makeDigestMatcher(matched: boolean): ArtifactDigestMatchPort {
  return {
    async matchStream(input, authorization) {
      return matched
        ? { matched: true }
        : {
            matched: false,
            diagnosticId: 'diag-test' as ProvisioningDiagnosticId,
            expectedDigestPrefix: 'expected' as import('@rohinik-org/provisioning-ir').DigestPrefix,
            computedDigestPrefix: 'computed' as import('@rohinik-org/provisioning-ir').DigestPrefix,
          }
    },
    async matchFile(handle, authorization) {
      return matched
        ? { matched: true }
        : {
            matched: false,
            diagnosticId: 'diag-test' as ProvisioningDiagnosticId,
            expectedDigestPrefix: 'expected' as import('@rohinik-org/provisioning-ir').DigestPrefix,
            computedDigestPrefix: 'computed' as import('@rohinik-org/provisioning-ir').DigestPrefix,
          }
    },
  }
}

// ── fixture: creates a real workspace in tmpdir ───────────────────────────────

async function makeWorkspace(): Promise<{ workspace: ProvisioningWorkspace; realRoot: string; cleanup: () => Promise<void> }> {
  const realRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'rhk-pkg-installer-test-'))
  // subdirs
  await fs.mkdir(path.join(realRoot, 'quarantine'), { recursive: true })
  await fs.mkdir(path.join(realRoot, 'staging'), { recursive: true })
  await fs.mkdir(path.join(realRoot, 'store'), { recursive: true })

  const workspace: ProvisioningWorkspace = {
    workspaceId: 'ws-test',
    root: realRoot as import('@rohinik-org/provisioning-ir').WorkspaceRoot,
    quarantineRoot: 'quarantine' as import('@rohinik-org/provisioning-ir').WorkspaceRelativePath,
    stagingRoot: 'staging' as import('@rohinik-org/provisioning-ir').WorkspaceRelativePath,
    packageStoreRoot: 'store' as import('@rohinik-org/provisioning-ir').WorkspaceRelativePath,
    modelStoreRoot: 'models' as import('@rohinik-org/provisioning-ir').WorkspaceRelativePath,
  }

  return {
    workspace,
    realRoot,
    cleanup: () => fs.rm(realRoot, { recursive: true, force: true }),
  }
}

// ── tests ──────────────────────────────────────────────────────────────────────

describe('RohinikPackageInstaller', () => {
  let cleanup: () => Promise<void>
  let workspace: ProvisioningWorkspace
  let realRoot: string

  beforeEach(async () => {
    const fixture = await makeWorkspace()
    workspace = fixture.workspace
    realRoot = fixture.realRoot
    cleanup = fixture.cleanup
  })

  afterEach(async () => {
    await cleanup()
  })

  // ── Test 1: Happy path — correct journal event sequence ─────────────────────
  it('T1: happy path produces correct journal event sequence across 4 phases', async () => {
    const { journal, calls } = makeJournal()
    const safeWorkspace = new SafeWorkspace(workspace, realRoot)
    const quarantineStore = new QuarantineStore(workspace, safeWorkspace)
    const installer = new RohinikPackageInstaller(
      makeFetcher(true),
      makeDigestMatcher(true),
      quarantineStore,
      safeWorkspace,
      isoNow,
    )

    const storeDir = path.join(realRoot, 'store', 'test-pkg-1.0.0')
    const action = makeAction('test-pkg', '1.0.0', storeDir)
    const authorization = makeAuthorization()

    const result = await installer.install(action, authorization, workspace, journal)

    // Extract event types in order
    const eventTypes = calls.map(c => c.type)
    expect(eventTypes).toEqual([
      'prepare', 'start', 'success',       // M1: fetch
      'val-start', 'val-success',           // Phase 2: validation
      'prepare', 'start', 'success',       // M2: staging
      'prepare', 'start', 'success',       // M3: finalization
    ])
  })

  // ── Test 2: Digest mismatch + retain-until-cleanup ─────────────────────────
  it('T2: retain-until-cleanup mismatch — ValidationFailedEntry has quarantineRecord, staging not created, throws', async () => {
    const { journal, calls } = makeJournal()
    const safeWorkspace = new SafeWorkspace(workspace, realRoot)
    const quarantineStore = new QuarantineStore(workspace, safeWorkspace)
    const installer = new RohinikPackageInstaller(
      makeFetcher(true),
      makeDigestMatcher(false),
      quarantineStore,
      safeWorkspace,
      isoNow,
    )

    const storeDir = path.join(realRoot, 'store', 'test-pkg-1.0.0')
    const action = makeAction('test-pkg', '1.0.0', storeDir)
    const authorization = makeAuthorization()

    // Override retention policy for this action — retain-until-cleanup is default when not delete-on-validation-failure
    // We'll inject via a custom action with no special field (the installer derives it from action)
    // The installer uses quarantineRetentionPolicy from the action if needed, but AuthorizedInstallRohinikPackageAction
    // doesn't have quarantineRetentionPolicy. The installer should default to 'retain-until-cleanup'.

    await expect(installer.install(action, authorization, workspace, journal)).rejects.toThrow(ArtifactDigestMismatchError)

    const valFail = calls.find(c => c.type === 'val-fail')
    expect(valFail).toBeDefined()
    expect((valFail as { type: 'val-fail'; quarantineRecord?: QuarantinedArtifactRecord }).quarantineRecord).toBeDefined()

    // Staging path should NOT be created
    const stagingPath = path.join(realRoot, 'staging', 'test-pkg-1.0.0')
    expect(existsSync(stagingPath)).toBe(false)
  })

  // ── Test 3: Digest mismatch + delete-on-validation-failure ────────────────
  it('T3: delete-on-validation-failure mismatch — quarantine file deleted, throws ArtifactDigestMismatchError', async () => {
    const { journal, calls } = makeJournal()
    const safeWorkspace = new SafeWorkspace(workspace, realRoot)
    const quarantineStore = new QuarantineStore(workspace, safeWorkspace)
    const installer = new RohinikPackageInstaller(
      makeFetcher(true),
      makeDigestMatcher(false),
      quarantineStore,
      safeWorkspace,
      isoNow,
    )

    // Build action with delete-on-validation-failure policy hint
    // AuthorizedInstallRohinikPackageAction doesn't have quarantineRetentionPolicy,
    // so we pass an extended object with the extra field
    const storeDir = path.join(realRoot, 'store', 'test-pkg-1.0.0')
    const baseAction = makeAction('test-pkg', '1.0.0', storeDir)
    const actionWithPolicy = { ...baseAction, quarantineRetentionPolicy: 'delete-on-validation-failure' } as AuthorizedInstallRohinikPackageAction & { quarantineRetentionPolicy?: string }

    await expect(installer.install(actionWithPolicy, makeAuthorization(), workspace, journal)).rejects.toThrow(ArtifactDigestMismatchError)

    // quarantine file must not exist
    const qPath = path.join(realRoot, 'quarantine', 'aai-test.download')
    expect(existsSync(qPath)).toBe(false)

    // val-fail should have no quarantineRecord
    const valFail = calls.find(c => c.type === 'val-fail') as { type: 'val-fail'; quarantineRecord?: QuarantinedArtifactRecord } | undefined
    expect(valFail?.quarantineRecord).toBeUndefined()
  })

  // ── Test 4: Fetch failure ──────────────────────────────────────────────────
  it('T4: fetch failure — recordFailure for M1, no validation/staging/finalization events', async () => {
    const { journal, calls } = makeJournal()
    const safeWorkspace = new SafeWorkspace(workspace, realRoot)
    const quarantineStore = new QuarantineStore(workspace, safeWorkspace)
    const installer = new RohinikPackageInstaller(
      makeFetcher(false),
      makeDigestMatcher(true),
      quarantineStore,
      safeWorkspace,
      isoNow,
    )

    const storeDir = path.join(realRoot, 'store', 'test-pkg-1.0.0')
    const action = makeAction('test-pkg', '1.0.0', storeDir)

    await expect(installer.install(action, makeAuthorization(), workspace, journal)).rejects.toThrow()

    const hasFail = calls.some(c => c.type === 'fail')
    const hasValStart = calls.some(c => c.type === 'val-start')
    const hasM2 = calls.filter(c => c.type === 'prepare').length >= 2

    expect(hasFail).toBe(true)
    expect(hasValStart).toBe(false)
    expect(hasM2).toBe(false)
  })

  // ── Test 5: installedPath equals action.destination ──────────────────────
  it('T5: installedPath in result equals action.destination', async () => {
    const { journal } = makeJournal()
    const safeWorkspace = new SafeWorkspace(workspace, realRoot)
    const quarantineStore = new QuarantineStore(workspace, safeWorkspace)
    const installer = new RohinikPackageInstaller(
      makeFetcher(true),
      makeDigestMatcher(true),
      quarantineStore,
      safeWorkspace,
      isoNow,
    )

    const storeDir = path.join(realRoot, 'store', 'test-pkg-1.0.0')
    const action = makeAction('test-pkg', '1.0.0', storeDir)

    const result = await installer.install(action, makeAuthorization(), workspace, journal)
    expect(result.installedPath).toBe(action.destination)
  })

  // ── Test 6: Quarantine record reason is 'digest-mismatch' ────────────────
  it('T6: quarantine record reason is "digest-mismatch" on mismatch', async () => {
    const { journal, calls } = makeJournal()
    const safeWorkspace = new SafeWorkspace(workspace, realRoot)
    const quarantineStore = new QuarantineStore(workspace, safeWorkspace)
    const installer = new RohinikPackageInstaller(
      makeFetcher(true),
      makeDigestMatcher(false),
      quarantineStore,
      safeWorkspace,
      isoNow,
    )

    const storeDir = path.join(realRoot, 'store', 'test-pkg-1.0.0')
    const action = makeAction('test-pkg', '1.0.0', storeDir)

    await expect(installer.install(action, makeAuthorization(), workspace, journal)).rejects.toThrow(ArtifactDigestMismatchError)

    const valFail = calls.find(c => c.type === 'val-fail') as { type: 'val-fail'; quarantineRecord?: QuarantinedArtifactRecord } | undefined
    expect(valFail?.quarantineRecord?.reason).toBe('digest-mismatch')
  })

  // ── Test 7: Quarantine record includes correct artifactAuthorizationId ────
  it('T7: quarantine record includes correct artifactAuthorizationId', async () => {
    const { journal, calls } = makeJournal()
    const safeWorkspace = new SafeWorkspace(workspace, realRoot)
    const quarantineStore = new QuarantineStore(workspace, safeWorkspace)
    const installer = new RohinikPackageInstaller(
      makeFetcher(true),
      makeDigestMatcher(false),
      quarantineStore,
      safeWorkspace,
      isoNow,
    )

    const storeDir = path.join(realRoot, 'store', 'test-pkg-1.0.0')
    const action = makeAction('test-pkg', '1.0.0', storeDir)
    const authorization = makeAuthorization('aai-custom')

    await expect(installer.install(action, authorization, workspace, journal)).rejects.toThrow()

    const valFail = calls.find(c => c.type === 'val-fail') as { type: 'val-fail'; quarantineRecord?: QuarantinedArtifactRecord } | undefined
    expect(valFail?.quarantineRecord?.artifactAuthorizationId).toBe('aai-custom')
  })

  // ── Test 8: Phase 1 compensation has kind 'delete-quarantine-path' ────────
  it('T8: Phase 1 compensation recorded with kind delete-quarantine-path', async () => {
    const { journal, calls } = makeJournal()
    const safeWorkspace = new SafeWorkspace(workspace, realRoot)
    const quarantineStore = new QuarantineStore(workspace, safeWorkspace)
    const installer = new RohinikPackageInstaller(
      makeFetcher(true),
      makeDigestMatcher(true),
      quarantineStore,
      safeWorkspace,
      isoNow,
    )

    const storeDir = path.join(realRoot, 'store', 'test-pkg-1.0.0')
    const action = makeAction('test-pkg', '1.0.0', storeDir)

    await installer.install(action, makeAuthorization(), workspace, journal)

    const m1Prepare = calls.find(c => c.type === 'prepare') as { type: 'prepare'; mutationId: string; classification: AuthorizedCompensationDefinition } | undefined
    expect(m1Prepare?.classification?.kind).toBe('delete-quarantine-path')
  })

  // ── Test 9: Phase 2 validation uses validationKind 'digest-match' ─────────
  it('T9: Phase 2 validation uses validationKind "digest-match"', async () => {
    const { journal, calls } = makeJournal()
    const safeWorkspace = new SafeWorkspace(workspace, realRoot)
    const quarantineStore = new QuarantineStore(workspace, safeWorkspace)
    const installer = new RohinikPackageInstaller(
      makeFetcher(true),
      makeDigestMatcher(true),
      quarantineStore,
      safeWorkspace,
      isoNow,
    )

    const storeDir = path.join(realRoot, 'store', 'test-pkg-1.0.0')
    const action = makeAction('test-pkg', '1.0.0', storeDir)

    await installer.install(action, makeAuthorization(), workspace, journal)

    const valStart = calls.find(c => c.type === 'val-start')
    expect(valStart).toBeDefined()
    expect((valStart as { type: 'val-start'; validationKind: string }).validationKind).toBe('digest-match')
  })

  // ── Test 10: Phase 3 compensation has kind 'delete-staging-path' ─────────
  it('T10: Phase 3 compensation recorded with kind delete-staging-path', async () => {
    const { journal, calls } = makeJournal()
    const safeWorkspace = new SafeWorkspace(workspace, realRoot)
    const quarantineStore = new QuarantineStore(workspace, safeWorkspace)
    const installer = new RohinikPackageInstaller(
      makeFetcher(true),
      makeDigestMatcher(true),
      quarantineStore,
      safeWorkspace,
      isoNow,
    )

    const storeDir = path.join(realRoot, 'store', 'test-pkg-1.0.0')
    const action = makeAction('test-pkg', '1.0.0', storeDir)

    await installer.install(action, makeAuthorization(), workspace, journal)

    const prepares = calls.filter(c => c.type === 'prepare') as Array<{ type: 'prepare'; mutationId: string; classification: AuthorizedCompensationDefinition }>
    const m2Prepare = prepares[1]
    expect(m2Prepare?.classification?.kind).toBe('delete-staging-path')
  })

  // ── Test 11: Phase 4 compensation has kind 'remove-package-store-dir' ─────
  it('T11: Phase 4 compensation recorded with kind remove-package-store-dir', async () => {
    const { journal, calls } = makeJournal()
    const safeWorkspace = new SafeWorkspace(workspace, realRoot)
    const quarantineStore = new QuarantineStore(workspace, safeWorkspace)
    const installer = new RohinikPackageInstaller(
      makeFetcher(true),
      makeDigestMatcher(true),
      quarantineStore,
      safeWorkspace,
      isoNow,
    )

    const storeDir = path.join(realRoot, 'store', 'test-pkg-1.0.0')
    const action = makeAction('test-pkg', '1.0.0', storeDir)

    await installer.install(action, makeAuthorization(), workspace, journal)

    const prepares = calls.filter(c => c.type === 'prepare') as Array<{ type: 'prepare'; mutationId: string; classification: AuthorizedCompensationDefinition }>
    const m3Prepare = prepares[2]
    expect(m3Prepare?.classification?.kind).toBe('remove-package-store-dir')
  })

  // ── Test 12: retain-until-cleanup mismatch — quarantineRecord in result ───
  it('T12: retain-until-cleanup mismatch — quarantineRecord in thrown error (validated via journal val-fail entry)', async () => {
    const { journal, calls } = makeJournal()
    const safeWorkspace = new SafeWorkspace(workspace, realRoot)
    const quarantineStore = new QuarantineStore(workspace, safeWorkspace)
    const installer = new RohinikPackageInstaller(
      makeFetcher(true),
      makeDigestMatcher(false),
      quarantineStore,
      safeWorkspace,
      isoNow,
    )

    const storeDir = path.join(realRoot, 'store', 'test-pkg-1.0.0')
    const action = makeAction('test-pkg', '1.0.0', storeDir)

    let caughtError: unknown
    try {
      await installer.install(action, makeAuthorization(), workspace, journal)
    } catch (err) {
      caughtError = err
    }

    expect(caughtError).toBeInstanceOf(ArtifactDigestMismatchError)

    const valFail = calls.find(c => c.type === 'val-fail') as { type: 'val-fail'; quarantineRecord?: QuarantinedArtifactRecord } | undefined
    expect(valFail?.quarantineRecord).toBeDefined()
    expect(valFail?.quarantineRecord?.retentionPolicy).toBe('retain-until-cleanup')
  })

  // ── Test 13: M1 success records instantiated compensation with quarantine path ─
  it('T13: M1 success instantiated compensation contains quarantine path', async () => {
    const { journal, calls } = makeJournal()
    const safeWorkspace = new SafeWorkspace(workspace, realRoot)
    const quarantineStore = new QuarantineStore(workspace, safeWorkspace)
    const installer = new RohinikPackageInstaller(
      makeFetcher(true),
      makeDigestMatcher(true),
      quarantineStore,
      safeWorkspace,
      isoNow,
    )

    const storeDir = path.join(realRoot, 'store', 'test-pkg-1.0.0')
    const action = makeAction('test-pkg', '1.0.0', storeDir)

    await installer.install(action, makeAuthorization(), workspace, journal)

    const m1Success = calls.find(c => c.type === 'success') as { type: 'success'; mutationId: string; instantiated?: InstantiatedCompensationRecord } | undefined
    expect(m1Success?.instantiated?.kind).toBe('delete-quarantine-path')
    expect(typeof m1Success?.instantiated?.parameters?.path).toBe('string')
  })

  // ── Test 14: installed package file actually exists at destination ─────────
  it('T14: package is actually installed at action.destination after happy path', async () => {
    const { journal } = makeJournal()
    const safeWorkspace = new SafeWorkspace(workspace, realRoot)
    const quarantineStore = new QuarantineStore(workspace, safeWorkspace)

    // Use a fetcher that writes a real file
    const fetcher: ArtifactFetchPort = {
      async fetch(source, destination) {
        const destPath = destination.quarantinePath as string
        await fs.writeFile(destPath, Buffer.from('package-bytes'))
        return {
          bytesWritten: 13,
          quarantineHandle: { quarantinePath: destination.quarantinePath, artifactAuthorizationId: destination.artifactAuthorizationId },
          effectiveSource: source,
        }
      },
    }

    const installer = new RohinikPackageInstaller(
      fetcher,
      makeDigestMatcher(true),
      quarantineStore,
      safeWorkspace,
      isoNow,
    )

    const storeDir = path.join(realRoot, 'store', 'test-pkg-1.0.0')
    const action = makeAction('test-pkg', '1.0.0', storeDir)

    const result = await installer.install(action, makeAuthorization(), workspace, journal)

    expect(existsSync(result.installedPath as string)).toBe(true)
  })
})
