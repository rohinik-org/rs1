import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtemp, writeFile, mkdir, readFile, access } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import type {
  AuthorizedApplyConfigurationAction,
  AuthorizedConfigurationTemplate,
  ProvisioningWorkspace,
  MutationJournalPort,
  ProvisioningActionId,
  ProvisioningMutationId,
  ProvisioningOperation,
  AuthorizationId,
  AuthorizationDecisionId,
  IsoTimestamp,
  WorkspaceRelativePath,
  WorkspaceRoot,
  AuthorizedCompensationDefinition,
  InstantiatedCompensationRecord,
  ProvisioningDiagnosticCode,
  ProvisioningDiagnosticId,
  QuarantinedArtifactRecord,
} from '@rohinik-org/provisioning-ir'
import { ConfigurationCoordinator } from '../configuration-coordinator.js'

const aid = (s: string) => s as ProvisioningActionId
const authId = (s: string) => s as AuthorizationId
const decId = (s: string) => s as AuthorizationDecisionId

function makeTemplate(overrides: Partial<AuthorizedConfigurationTemplate> = {}): AuthorizedConfigurationTemplate {
  const canonicalContent = overrides.canonicalContent ?? 'KEY=value\n'
  const contentSemanticHash = createHash('sha256').update(canonicalContent).digest('hex')
  return {
    templateId: 'tmpl-1',
    configurationKey: 'my.config',
    destination: 'config/app.env' as WorkspaceRelativePath,
    valueType: 'string',
    canonicalContent,
    contentSemanticHash,
    writePolicy: 'create-if-absent',
    ...overrides,
  }
}

function makeAction(
  template: AuthorizedConfigurationTemplate,
  mutating = true,
): AuthorizedApplyConfigurationAction {
  return {
    kind: 'apply-configuration-template',
    actionId: aid('a1'),
    template,
    secretRequirements: [],
    dependsOn: [],
    authorization: {
      authorizationId: authId('auth-1'),
      authorizationDecisionId: decId('dec-1'),
      authorizedTargetHash: 'hash',
    },
    mutationPolicy: mutating
      ? { mutating: true, compensation: { kind: 'remove-generated-state', parameters: { path: template.destination } } }
      : { mutating: false },
  }
}

class StubJournal implements MutationJournalPort {
  readonly calls: string[] = []
  prepareMutation(_a: ProvisioningActionId, _m: ProvisioningMutationId, _op: ProvisioningOperation, _c: AuthorizedCompensationDefinition | { kind: 'non-compensable'; approvedReasonCode: string }): void { this.calls.push('prepare') }
  startMutation(_a: ProvisioningActionId, _m: ProvisioningMutationId, _op: ProvisioningOperation): void { this.calls.push('start') }
  recordSuccess(_a: ProvisioningActionId, _m: ProvisioningMutationId, _op: ProvisioningOperation, _c?: InstantiatedCompensationRecord): void { this.calls.push('success') }
  recordFailure(_a: ProvisioningActionId, _m: ProvisioningMutationId, _op: ProvisioningOperation, _codes: readonly ProvisioningDiagnosticCode[], _ids: readonly ProvisioningDiagnosticId[]): void { this.calls.push('failure') }
  recordValidationStarted(_a: ProvisioningActionId, _m: ProvisioningMutationId, _k: string): void { this.calls.push('val-start') }
  recordValidationSucceeded(_a: ProvisioningActionId, _m: ProvisioningMutationId, _k: string): void { this.calls.push('val-success') }
  recordValidationFailed(_a: ProvisioningActionId, _m: ProvisioningMutationId, _k: string, _codes: readonly ProvisioningDiagnosticCode[], _ids: readonly ProvisioningDiagnosticId[], _q?: QuarantinedArtifactRecord): void { this.calls.push('val-failure') }
}

describe('ConfigurationCoordinator', () => {
  let workspaceRoot: string
  let workspace: ProvisioningWorkspace
  let coordinator: ConfigurationCoordinator
  let journal: StubJournal
  const clock = () => '2024-01-01T00:00:00.000Z' as IsoTimestamp

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(join(tmpdir(), 'cc-test-'))
    workspace = {
      workspaceId: 'ws-1',
      root: workspaceRoot as WorkspaceRoot,
      quarantineRoot: '.quarantine' as WorkspaceRelativePath,
      stagingRoot: '.staging' as WorkspaceRelativePath,
      packageStoreRoot: '.packages' as WorkspaceRelativePath,
      modelStoreRoot: '.models' as WorkspaceRelativePath,
    }
    coordinator = new ConfigurationCoordinator(workspaceRoot, clock)
    journal = new StubJournal()
  })

  describe('create-if-absent', () => {
    it('writes file and adds sidecar record when destination absent', async () => {
      const template = makeTemplate({ writePolicy: 'create-if-absent' })
      const action = makeAction(template)
      const result = await coordinator.apply(action, workspace, journal)

      expect(result.applied).toContain(template.configurationKey)
      expect(result.skipped).toHaveLength(0)
      expect(result.failed).toHaveLength(0)

      const written = await readFile(join(workspaceRoot, template.destination), 'utf8')
      expect(written).toBe(template.canonicalContent)

      const sidecarPath = join(workspaceRoot, '.rohinik', 'generated-files.json')
      const sidecar = JSON.parse(await readFile(sidecarPath, 'utf8'))
      expect(sidecar.files).toHaveLength(1)
      expect(sidecar.files[0].templateId).toBe('tmpl-1')
      expect(sidecar.files[0].path).toBe(template.destination)
    })

    it('skips when destination already present, sidecar unchanged', async () => {
      const template = makeTemplate({ writePolicy: 'create-if-absent' })
      const action = makeAction(template)

      await mkdir(join(workspaceRoot, 'config'), { recursive: true })
      await writeFile(join(workspaceRoot, template.destination), 'existing content')

      const result = await coordinator.apply(action, workspace, journal)
      expect(result.skipped).toContain(template.configurationKey)
      expect(result.applied).toHaveLength(0)

      // sidecar should not exist (never written)
      const sidecarPath = join(workspaceRoot, '.rohinik', 'generated-files.json')
      await expect(access(sidecarPath)).rejects.toThrow()
    })
  })

  describe('replace-authorized-generated-file', () => {
    it('replaces when sidecar present and hash matches', async () => {
      // First: create via create-if-absent to establish sidecar
      const createTemplate = makeTemplate({ writePolicy: 'create-if-absent', canonicalContent: 'KEY=old\n' })
      await coordinator.apply(makeAction(createTemplate), workspace, new StubJournal())

      // Now replace
      const replaceTemplate = makeTemplate({
        writePolicy: 'replace-authorized-generated-file',
        canonicalContent: 'KEY=new\n',
      })
      const result = await coordinator.apply(makeAction(replaceTemplate), workspace, journal)

      expect(result.applied).toContain(replaceTemplate.configurationKey)
      expect(result.failed).toHaveLength(0)

      const written = await readFile(join(workspaceRoot, replaceTemplate.destination), 'utf8')
      expect(written).toBe('KEY=new\n')
    })

    it('fails with UNAUTHORIZED_FILE_REPLACE when no sidecar record exists', async () => {
      const template = makeTemplate({ writePolicy: 'replace-authorized-generated-file' })
      const action = makeAction(template)
      const result = await coordinator.apply(action, workspace, journal)
      expect(result.failed).toContain(template.configurationKey)
      expect(result.applied).toHaveLength(0)
    })

    it('fails with UNAUTHORIZED_FILE_REPLACE when current file hash differs from sidecar record', async () => {
      // Create via create-if-absent
      const createTemplate = makeTemplate({ writePolicy: 'create-if-absent', canonicalContent: 'KEY=original\n' })
      await coordinator.apply(makeAction(createTemplate), workspace, new StubJournal())

      // Tamper with the file
      await writeFile(join(workspaceRoot, 'config/app.env'), 'TAMPERED=yes\n')

      // Attempt replace
      const replaceTemplate = makeTemplate({ writePolicy: 'replace-authorized-generated-file', canonicalContent: 'KEY=new\n' })
      const result = await coordinator.apply(makeAction(replaceTemplate), workspace, journal)
      expect(result.failed).toContain(replaceTemplate.configurationKey)
    })

    it('creates tmp files then renames them (no tmp files remain)', async () => {
      // Create to establish sidecar
      const createTemplate = makeTemplate({ writePolicy: 'create-if-absent', canonicalContent: 'KEY=v1\n' })
      await coordinator.apply(makeAction(createTemplate), workspace, new StubJournal())

      const replaceTemplate = makeTemplate({ writePolicy: 'replace-authorized-generated-file', canonicalContent: 'KEY=v2\n' })
      await coordinator.apply(makeAction(replaceTemplate), workspace, journal)

      // Tmp files should be gone
      await expect(access(join(workspaceRoot, 'config/app.env.rhk-tmp'))).rejects.toThrow()
      await expect(access(join(workspaceRoot, '.rohinik/generated-files.rhk-tmp'))).rejects.toThrow()
    })
  })

  describe('validate-only', () => {
    it('adds to applied when destination exists, no write', async () => {
      const template = makeTemplate({ writePolicy: 'validate-only' })
      await mkdir(join(workspaceRoot, 'config'), { recursive: true })
      await writeFile(join(workspaceRoot, template.destination), 'whatever')
      const action = makeAction(template, false)

      const result = await coordinator.apply(action, workspace, journal)
      expect(result.applied).toContain(template.configurationKey)
      expect(result.failed).toHaveLength(0)
    })

    it('adds to failed when destination absent, no write', async () => {
      const template = makeTemplate({ writePolicy: 'validate-only' })
      const action = makeAction(template, false)
      const result = await coordinator.apply(action, workspace, journal)
      expect(result.failed).toContain(template.configurationKey)
      expect(result.applied).toHaveLength(0)
    })
  })

  describe('sidecar integrity', () => {
    it('sidecar does NOT contain generatedAt field', async () => {
      const template = makeTemplate({ writePolicy: 'create-if-absent' })
      await coordinator.apply(makeAction(template), workspace, journal)

      const sidecarPath = join(workspaceRoot, '.rohinik', 'generated-files.json')
      const raw = await readFile(sidecarPath, 'utf8')
      expect(raw).not.toContain('generatedAt')
    })

    it('sidecar contentHash matches SHA-256 of written content', async () => {
      const content = 'KEY=value\n'
      const template = makeTemplate({ writePolicy: 'create-if-absent', canonicalContent: content })
      await coordinator.apply(makeAction(template), workspace, journal)

      const sidecarPath = join(workspaceRoot, '.rohinik', 'generated-files.json')
      const sidecar = JSON.parse(await readFile(sidecarPath, 'utf8'))
      const expected = createHash('sha256').update(content).digest('hex')
      expect(sidecar.files[0].contentHash).toBe(expected)
    })
  })
})
