import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { createHash } from 'node:crypto'
import { NpmDependencyExecutor } from '../npm-executor.js'
import { NpmManifestValidator } from '../npm-manifest-validator.js'
import type {
  AuthorizedNpmInstallManifest,
  ProvisioningWorkspace,
  MutationJournalPort,
  ProvisioningMutationId,
  ProvisioningActionId,
  ProvisioningOperation,
  NpmInstallManifestHash,
  IsoTimestamp,
  AuthorizedCompensationDefinition,
  InstantiatedCompensationRecord,
} from '@rohinik-org/provisioning-ir'
import { PreflightError } from '@rohinik-org/provisioning-ir'

function sha256Hex(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex')
}
function semanticHash(content: string): string {
  return sha256Hex(JSON.stringify(JSON.parse(content)))
}

function isoNow(): IsoTimestamp {
  return new Date().toISOString() as IsoTimestamp
}

const PKG_JSON = JSON.stringify({ name: 'test', version: '1.0.0' })
const LOCK_JSON = JSON.stringify({ lockfileVersion: 3, packages: { 'node_modules/lodash': { version: '4.17.21' }, '': { version: '1.0.0' } } })

function makeManifest(recordOverrides?: Partial<AuthorizedNpmInstallManifest>): AuthorizedNpmInstallManifest {
  const pkgHash = semanticHash(PKG_JSON)
  const lockHash = semanticHash(LOCK_JSON)
  return {
    ecosystem: 'npm',
    lockfileVersion: 3,
    packageJsonCanonicalContent: PKG_JSON,
    packageJsonSemanticHash: pkgHash,
    packageLockCanonicalContent: LOCK_JSON,
    packageLockSemanticHash: lockHash,
    packageRecords: [
      {
        packagePath: 'node_modules/lodash',
        name: 'lodash',
        version: '4.17.21',
        resolvedArtifact: { sourceKind: 'uri', uri: 'https://registry.npmjs.org/lodash.tgz' },
        integrity: { algorithm: 'sha256', encoding: 'hex', value: 'abc' },
        optional: false,
        dev: false,
        expectedDisposition: 'installed',
      },
      {
        packagePath: '',
        name: 'test',
        version: '1.0.0',
        resolvedArtifact: { sourceKind: 'uri', uri: '' },
        integrity: { algorithm: 'sha256', encoding: 'hex', value: 'abc' },
        optional: false,
        dev: false,
        expectedDisposition: 'root',
      },
    ],
    semanticHash: sha256Hex('test').padEnd(64, '0').slice(0, 64) as NpmInstallManifestHash,
    ...recordOverrides,
  }
}

type JournalCall =
  | { type: 'prepare'; mutationId: string }
  | { type: 'start'; mutationId: string }
  | { type: 'success'; mutationId: string; instantiated: InstantiatedCompensationRecord | undefined }
  | { type: 'fail'; mutationId: string }

function makeJournal(): { journal: MutationJournalPort; calls: JournalCall[] } {
  const calls: JournalCall[] = []
  const journal: MutationJournalPort = {
    prepareMutation(_a: ProvisioningActionId, mutationId: ProvisioningMutationId, _op: ProvisioningOperation, _cls: AuthorizedCompensationDefinition | { kind: 'non-compensable'; approvedReasonCode: string }) {
      calls.push({ type: 'prepare', mutationId: mutationId as string })
    },
    startMutation(_a: ProvisioningActionId, mutationId: ProvisioningMutationId, _op: ProvisioningOperation) {
      calls.push({ type: 'start', mutationId: mutationId as string })
    },
    recordSuccess(_a: ProvisioningActionId, mutationId: ProvisioningMutationId, _op: ProvisioningOperation, instantiated?: InstantiatedCompensationRecord) {
      calls.push({ type: 'success', mutationId: mutationId as string, instantiated })
    },
    recordFailure(_a: ProvisioningActionId, mutationId: ProvisioningMutationId, _op: ProvisioningOperation, _codes: readonly import('@rohinik-org/provisioning-ir').ProvisioningDiagnosticCode[], _ids: readonly import('@rohinik-org/provisioning-ir').ProvisioningDiagnosticId[]) {
      calls.push({ type: 'fail', mutationId: mutationId as string })
    },
    recordValidationStarted() {},
    recordValidationSucceeded() {},
    recordValidationFailed() {},
  }
  return { journal, calls }
}

function makeWorkspace(root: string): ProvisioningWorkspace {
  return {
    workspaceId: 'ws-test',
    root: root as import('@rohinik-org/provisioning-ir').WorkspaceRoot,
    quarantineRoot: 'quarantine' as import('@rohinik-org/provisioning-ir').WorkspaceRelativePath,
    stagingRoot: 'staging' as import('@rohinik-org/provisioning-ir').WorkspaceRelativePath,
    packageStoreRoot: 'store' as import('@rohinik-org/provisioning-ir').WorkspaceRelativePath,
    modelStoreRoot: 'models' as import('@rohinik-org/provisioning-ir').WorkspaceRelativePath,
  }
}

const okSpawner = async (_args: string[]) => ({ exitCode: 0, stdout: '', stderr: '' })
const failSpawner = async (_args: string[]) => ({ exitCode: 1, stdout: '', stderr: 'fail' })

describe('NpmDependencyExecutor', () => {
  let tmpDir: string
  let workspace: ProvisioningWorkspace
  const validator = new NpmManifestValidator()

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rhk-dep-exec-'))
    workspace = makeWorkspace(tmpDir)
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('T-E1: observe returns correct expectedInstallCount (only installed records)', async () => {
    const exec = new NpmDependencyExecutor(validator, okSpawner, isoNow)
    const obs = await exec.observe(makeManifest(), workspace)
    // 1 installed, 1 root
    expect(obs.expectedInstallCount).toBe(1)
  })

  it('T-E2: observe includes correct expectedMutations array', async () => {
    const exec = new NpmDependencyExecutor(validator, okSpawner, isoNow)
    const obs = await exec.observe(makeManifest(), workspace)
    expect(obs.expectedMutations).toEqual(['write-package-json', 'write-package-lock', 'npm-ci'])
  })

  it('T-E3: apply + require-absent + existing node_modules → PreflightError before any mutation', async () => {
    await fs.mkdir(path.join(tmpDir, 'node_modules'), { recursive: true })
    const exec = new NpmDependencyExecutor(validator, okSpawner, isoNow)
    const { journal, calls } = makeJournal()
    await expect(
      exec.apply(makeManifest(), workspace, journal, { existingNodeModulesPolicy: 'require-absent' }),
    ).rejects.toThrow(PreflightError)
    expect(calls).toHaveLength(0)
  })

  it('T-E4: apply + require-absent + no node_modules → calls spawner with [npm, ci, --ignore-scripts]', async () => {
    const spawned: string[][] = []
    const spawner = async (args: string[]) => { spawned.push(args); return { exitCode: 0, stdout: '', stderr: '' } }
    const exec = new NpmDependencyExecutor(validator, spawner, isoNow)
    const { journal } = makeJournal()
    await exec.apply(makeManifest(), workspace, journal, { existingNodeModulesPolicy: 'require-absent' })
    expect(spawned).toHaveLength(1)
    expect(spawned[0]).toEqual(['npm', 'ci', '--ignore-scripts'])
  })

  it('T-E5: apply + require-rohinik-managed + node_modules + no marker → PreflightError', async () => {
    await fs.mkdir(path.join(tmpDir, 'node_modules'), { recursive: true })
    const exec = new NpmDependencyExecutor(validator, okSpawner, isoNow)
    const { journal } = makeJournal()
    await expect(
      exec.apply(makeManifest(), workspace, journal, { existingNodeModulesPolicy: 'require-rohinik-managed' }),
    ).rejects.toThrow(PreflightError)
  })

  it('T-E6: apply writes package.json.rhk-tmp then renames to package.json', async () => {
    const writes: string[] = []
    const renames: Array<[string, string]> = []
    const spawner = async (_args: string[]) => ({ exitCode: 0, stdout: '', stderr: '' })
    const exec = new NpmDependencyExecutor(validator, spawner, isoNow)
    const { journal } = makeJournal()
    await exec.apply(makeManifest(), workspace, journal)
    // Verify package.json exists at root and has expected content
    const content = await fs.readFile(path.join(tmpDir, 'package.json'), 'utf8')
    expect(content).toBe(PKG_JSON)
    // .rhk-tmp must not exist after rename
    expect(existsSync(path.join(tmpDir, 'package.json.rhk-tmp'))).toBe(false)
  })

  it('T-E7: apply writes package-lock.json.rhk-tmp then renames to package-lock.json', async () => {
    const exec = new NpmDependencyExecutor(validator, okSpawner, isoNow)
    const { journal } = makeJournal()
    await exec.apply(makeManifest(), workspace, journal)
    const content = await fs.readFile(path.join(tmpDir, 'package-lock.json'), 'utf8')
    expect(content).toBe(LOCK_JSON)
    expect(existsSync(path.join(tmpDir, 'package-lock.json.rhk-tmp'))).toBe(false)
  })

  it('T-E8: apply spawner non-zero exit → throws, recordFailure called for npm mutation', async () => {
    const exec = new NpmDependencyExecutor(validator, failSpawner, isoNow)
    const { journal, calls } = makeJournal()
    await expect(exec.apply(makeManifest(), workspace, journal)).rejects.toThrow()
    expect(calls.some(c => c.type === 'fail')).toBe(true)
  })

  it('T-E9: apply spawner zero exit → recordSuccess for all 3 mutations', async () => {
    const exec = new NpmDependencyExecutor(validator, okSpawner, isoNow)
    const { journal, calls } = makeJournal()
    await exec.apply(makeManifest(), workspace, journal)
    const successes = calls.filter(c => c.type === 'success')
    expect(successes).toHaveLength(3)
  })

  it('T-E10: apply writes .rohinik/managed-node_modules marker after success', async () => {
    const exec = new NpmDependencyExecutor(validator, okSpawner, isoNow)
    const { journal } = makeJournal()
    await exec.apply(makeManifest(), workspace, journal)
    expect(existsSync(path.join(tmpDir, '.rohinik', 'managed-node_modules'))).toBe(true)
  })

  it('T-E11: inspect lockfile absent → LOCKFILE_HASH_MISMATCH', async () => {
    const exec = new NpmDependencyExecutor(validator, okSpawner, isoNow)
    const result = await exec.inspect(makeManifest(), workspace)
    expect(result.compliant).toBe(false)
    expect(result.driftItems[0]?.code).toBe('LOCKFILE_HASH_MISMATCH')
  })

  it('T-E12: inspect declared installed package absent from node_modules → PACKAGE_MISSING', async () => {
    // Write a matching lockfile
    await fs.writeFile(path.join(tmpDir, 'package-lock.json'), LOCK_JSON, 'utf8')
    // No node_modules/lodash
    const exec = new NpmDependencyExecutor(validator, okSpawner, isoNow)
    const result = await exec.inspect(makeManifest(), workspace)
    expect(result.driftItems.some(d => d.code === 'PACKAGE_MISSING')).toBe(true)
  })

  it('T-E13: inspect 3-record manifest, middle absent → exactly 1 drift item', async () => {
    const lockJson = JSON.stringify({
      lockfileVersion: 3,
      packages: {
        'node_modules/a': { version: '1.0.0' },
        'node_modules/b': { version: '2.0.0' },
        'node_modules/c': { version: '3.0.0' },
        '': { version: '1.0.0' },
      },
    })
    const manifest: AuthorizedNpmInstallManifest = {
      ecosystem: 'npm',
      lockfileVersion: 3,
      packageJsonCanonicalContent: PKG_JSON,
      packageJsonSemanticHash: semanticHash(PKG_JSON),
      packageLockCanonicalContent: lockJson,
      packageLockSemanticHash: semanticHash(lockJson),
      packageRecords: [
        { packagePath: 'node_modules/a', name: 'a', version: '1.0.0', resolvedArtifact: { sourceKind: 'uri', uri: '' }, integrity: { algorithm: 'sha256', encoding: 'hex', value: '' }, optional: false, dev: false, expectedDisposition: 'installed' },
        { packagePath: 'node_modules/b', name: 'b', version: '2.0.0', resolvedArtifact: { sourceKind: 'uri', uri: '' }, integrity: { algorithm: 'sha256', encoding: 'hex', value: '' }, optional: false, dev: false, expectedDisposition: 'installed' },
        { packagePath: 'node_modules/c', name: 'c', version: '3.0.0', resolvedArtifact: { sourceKind: 'uri', uri: '' }, integrity: { algorithm: 'sha256', encoding: 'hex', value: '' }, optional: false, dev: false, expectedDisposition: 'installed' },
      ],
      semanticHash: sha256Hex('x').padEnd(64, '0').slice(0, 64) as NpmInstallManifestHash,
    }

    await fs.writeFile(path.join(tmpDir, 'package-lock.json'), lockJson, 'utf8')
    // Write a and c, skip b
    await fs.mkdir(path.join(tmpDir, 'node_modules', 'a'), { recursive: true })
    await fs.writeFile(path.join(tmpDir, 'node_modules', 'a', 'package.json'), JSON.stringify({ version: '1.0.0' }))
    await fs.mkdir(path.join(tmpDir, 'node_modules', 'c'), { recursive: true })
    await fs.writeFile(path.join(tmpDir, 'node_modules', 'c', 'package.json'), JSON.stringify({ version: '3.0.0' }))

    const exec = new NpmDependencyExecutor(validator, okSpawner, isoNow)
    const result = await exec.inspect(manifest, workspace)
    expect(result.driftItems).toHaveLength(1)
    expect(result.driftItems[0]?.code).toBe('PACKAGE_MISSING')
    expect(result.driftItems[0]?.target).toBe('b')
  })

  it('T-E14: installedCount counts only expectedDisposition=installed records', async () => {
    const exec = new NpmDependencyExecutor(validator, okSpawner, isoNow)
    const { journal } = makeJournal()
    const result = await exec.apply(makeManifest(), workspace, journal)
    // manifest has 1 installed, 1 root
    expect(result.installedCount).toBe(1)
  })
})
