import * as fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import * as path from 'node:path'
import { randomUUID } from 'node:crypto'
import type {
  AuthorizedNpmInstallManifest,
  ProvisioningWorkspace,
  MutationJournalPort,
  LanguageDependencyApplyPort,
  LanguageDependencyObservePort,
  LanguageDependencyInspectPort,
  LanguageDependencyObservation,
  LanguageDependencyExecutionResult,
  LanguageDependencyComplianceResult,
  ProvisioningDriftItem,
  CompensationResult,
  ProvisioningExecutionId,
  ProvisioningMutationId,
  ProvisioningOperation,
  ProvisioningActionId,
  NpmExistingNodeModulesPolicy,
  IsoTimestamp,
  AuthorizedCompensationDefinition,
  ProvisioningDiagnosticCode,
} from '@rohinik-org/provisioning-ir'
import { PreflightError } from '@rohinik-org/provisioning-ir'
import type { NpmManifestValidator } from './npm-manifest-validator.js'
import { sha256Hex } from './npm-manifest-validator.js'

type SpawnResult = { exitCode: number; stdout: string; stderr: string }

const TMP_SUFFIX = '.rhk-tmp'

export class NpmDependencyExecutor
  implements LanguageDependencyApplyPort, LanguageDependencyObservePort, LanguageDependencyInspectPort
{
  constructor(
    private readonly validator: NpmManifestValidator,
    private readonly spawner: (args: string[]) => Promise<SpawnResult>,
    private readonly clock: () => IsoTimestamp,
    private readonly platform: NodeJS.Platform = process.platform,
  ) {}

  async observe(
    manifest: AuthorizedNpmInstallManifest,
    _workspace: ProvisioningWorkspace,
  ): Promise<LanguageDependencyObservation> {
    return {
      ecosystem: 'npm',
      expectedInstallCount: manifest.packageRecords.filter(r => r.expectedDisposition === 'installed').length,
      expectedMutations: ['write-package-json', 'write-package-lock', 'npm-ci'],
    }
  }

  async apply(
    manifest: AuthorizedNpmInstallManifest,
    workspace: ProvisioningWorkspace,
    journal: MutationJournalPort,
    options?: { existingNodeModulesPolicy?: NpmExistingNodeModulesPolicy; actionId?: ProvisioningActionId },
  ): Promise<LanguageDependencyExecutionResult> {
    this.validator.validate(manifest)

    const root = workspace.root as string
    const policy = options?.existingNodeModulesPolicy ?? 'require-absent'
    const actionId = (options?.actionId ?? 'npm-apply') as ProvisioningActionId
    const nodeModulesPath = path.join(root, 'node_modules')
    const markerPath = path.join(root, '.rohinik', 'managed-node_modules')

    // Preflight check
    const nmExists = existsSync(nodeModulesPath)
    if (policy === 'require-absent' && nmExists) {
      throw new PreflightError(
        ['node_modules exists but policy requires absent'],
        'node_modules exists but policy requires absent',
      )
    }
    if (policy === 'require-rohinik-managed' && nmExists && !existsSync(markerPath)) {
      throw new PreflightError(
        ['node_modules exists but is not rohinik-managed'],
        'node_modules exists but is not rohinik-managed',
      )
    }

    const startMs = Date.now()
    const operation: ProvisioningOperation = { kind: 'install-language-package', targetId: 'npm' }

    // M1: write package.json
    const m1Id = randomUUID() as ProvisioningMutationId
    const pkgJsonPath = path.join(root, 'package.json')
    const pkgJsonTmp = pkgJsonPath + TMP_SUFFIX
    const m1Classification: AuthorizedCompensationDefinition = {
      kind: 'restore-package-json',
      parameters: { path: pkgJsonPath },
    }
    journal.prepareMutation(actionId, m1Id, operation, m1Classification)
    journal.startMutation(actionId, m1Id, operation)
    await fs.writeFile(pkgJsonTmp, manifest.packageJsonCanonicalContent, 'utf8')
    await fs.rename(pkgJsonTmp, pkgJsonPath)
    journal.recordSuccess(actionId, m1Id, operation, {
      kind: 'restore-package-json',
      parameters: { path: pkgJsonPath },
    })

    // M2: write package-lock.json
    const m2Id = randomUUID() as ProvisioningMutationId
    const lockPath = path.join(root, 'package-lock.json')
    const lockTmp = lockPath + TMP_SUFFIX
    const m2Classification: AuthorizedCompensationDefinition = {
      kind: 'restore-package-lock-json',
      parameters: { path: lockPath },
    }
    journal.prepareMutation(actionId, m2Id, operation, m2Classification)
    journal.startMutation(actionId, m2Id, operation)
    await fs.writeFile(lockTmp, manifest.packageLockCanonicalContent, 'utf8')
    await fs.rename(lockTmp, lockPath)
    journal.recordSuccess(actionId, m2Id, operation, {
      kind: 'restore-package-lock-json',
      parameters: { path: lockPath },
    })

    // M3: npm ci
    const m3Id = randomUUID() as ProvisioningMutationId
    const m3Classification: AuthorizedCompensationDefinition = {
      kind: 'remove-node-modules',
      parameters: { path: nodeModulesPath },
    }
    journal.prepareMutation(actionId, m3Id, operation, m3Classification)
    journal.startMutation(actionId, m3Id, operation)

    const spawnResult = await this.spawner(['npm', 'ci', '--ignore-scripts'])
    if (spawnResult.exitCode !== 0) {
      journal.recordFailure(actionId, m3Id, operation, [], [])
      throw new Error(`npm ci failed with exit code ${spawnResult.exitCode}: ${spawnResult.stderr}`)
    }

    journal.recordSuccess(actionId, m3Id, operation, {
      kind: 'remove-node-modules',
      parameters: { path: nodeModulesPath },
    })

    // Write managed marker
    await fs.mkdir(path.join(root, '.rohinik'), { recursive: true })
    await fs.writeFile(markerPath, '', 'utf8')

    const installedCount = manifest.packageRecords.filter(r => r.expectedDisposition === 'installed').length
    return {
      ecosystem: 'npm',
      installedCount,
      durationMs: Date.now() - startMs,
    }
  }

  async inspect(
    manifest: AuthorizedNpmInstallManifest,
    workspace: ProvisioningWorkspace,
  ): Promise<LanguageDependencyComplianceResult> {
    const root = workspace.root as string
    const lockPath = path.join(root, 'package-lock.json')
    const driftItems: ProvisioningDriftItem[] = []

    if (!existsSync(lockPath)) {
      return {
        compliant: false,
        driftItems: [{ code: 'LOCKFILE_HASH_MISMATCH', target: lockPath, detail: 'package-lock.json absent' }],
      }
    }

    const lockContent = await fs.readFile(lockPath, 'utf8')
    const actualHash = sha256Hex(JSON.stringify(JSON.parse(lockContent)))
    if (actualHash !== manifest.packageLockSemanticHash) {
      driftItems.push({ code: 'LOCKFILE_HASH_MISMATCH', target: lockPath, detail: 'lockfile hash mismatch' })
    }

    for (const record of manifest.packageRecords) {
      if (record.expectedDisposition !== 'installed') continue
      const pkgJsonPath = path.join(root, 'node_modules', record.name, 'package.json')
      if (!existsSync(pkgJsonPath)) {
        driftItems.push({ code: 'PACKAGE_MISSING', target: record.name, detail: `${record.name} not found in node_modules` })
        continue
      }
      const pkgJson = JSON.parse(await fs.readFile(pkgJsonPath, 'utf8')) as { version?: string }
      if (pkgJson.version !== record.version) {
        driftItems.push({
          code: 'PACKAGE_VERSION_MISMATCH',
          target: record.name,
          detail: `expected ${record.version}, found ${pkgJson.version ?? 'unknown'}`,
        })
      }
    }

    return { compliant: driftItems.length === 0, driftItems }
  }

  // ponytail: best-effort backup/restore; full transactional compensation is Stage 9J scope
  async compensate(
    _executionId: ProvisioningExecutionId,
    workspace: ProvisioningWorkspace,
  ): Promise<CompensationResult> {
    const root = workspace.root as string
    const diagnosticCodes: ProvisioningDiagnosticCode[] = []

    for (const file of ['package.json', 'package-lock.json']) {
      const backup = path.join(root, `${file}.rhk-backup`)
      const dest = path.join(root, file)
      if (existsSync(backup)) {
        try { await fs.rename(backup, dest) } catch { diagnosticCodes.push(`restore-failed:${file}` as ProvisioningDiagnosticCode) }
      }
    }

    const markerPath = path.join(root, '.rohinik', 'managed-node_modules')
    const nmPath = path.join(root, 'node_modules')
    if (!existsSync(markerPath) && existsSync(nmPath)) {
      try { await fs.rm(nmPath, { recursive: true, force: true }) } catch { diagnosticCodes.push('remove-node-modules-failed' as ProvisioningDiagnosticCode) }
    }

    return { succeeded: diagnosticCodes.length === 0, diagnosticCodes }
  }
}
