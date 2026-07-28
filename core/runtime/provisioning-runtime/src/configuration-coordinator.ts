import { access, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import type {
  AuthorizedApplyConfigurationAction,
  ConfigurationApplicationResult,
  IsoTimestamp,
  MutationJournalPort,
  ProvisioningDiagnosticCode,
  ProvisioningMutationId,
  ProvisioningOperation,
  ProvisioningWorkspace,
} from '@rohinik-org/provisioning-ir'

interface GeneratedFileRecord {
  readonly path: string
  readonly templateId: string
  readonly contentHash: string
  readonly authorizationId: string
  readonly actionId: string
}

interface ProvenanceSidecar {
  files: GeneratedFileRecord[]
}

function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

function newMutationId(): ProvisioningMutationId {
  return `mut-${Math.random().toString(36).slice(2)}` as ProvisioningMutationId
}

export class ConfigurationCoordinator {
  constructor(
    private readonly workspaceRoot: string,
    private readonly clock: () => IsoTimestamp,
  ) {}

  async apply(
    action: AuthorizedApplyConfigurationAction,
    _workspace: ProvisioningWorkspace,
    journal: MutationJournalPort,
  ): Promise<ConfigurationApplicationResult> {
    const { template } = action
    const destAbs = join(this.workspaceRoot, template.destination)
    const sidecarPath = join(this.workspaceRoot, '.rohinik', 'generated-files.json')
    const op: ProvisioningOperation = { kind: 'apply-configuration-template', targetId: template.configurationKey }

    if (template.writePolicy === 'validate-only') {
      return this.validateOnly(action, destAbs, op)
    }

    if (template.writePolicy === 'create-if-absent') {
      return this.createIfAbsent(action, destAbs, sidecarPath, op, journal)
    }

    if (template.writePolicy === 'replace-authorized-generated-file') {
      return this.replaceAuthorized(action, destAbs, sidecarPath, op, journal)
    }

    // ponytail: exhaustive — TS narrowing covers this at compile time, runtime guard for safety
    throw new Error(`ConfigurationCoordinator: unknown writePolicy '${(template as { writePolicy: string }).writePolicy}'`)
  }

  private async validateOnly(
    action: AuthorizedApplyConfigurationAction,
    destAbs: string,
    op: ProvisioningOperation,
  ): Promise<ConfigurationApplicationResult> {
    const exists = await fileExists(destAbs)
    if (exists) {
      return { applied: [action.template.configurationKey], skipped: [], failed: [] }
    }
    return { applied: [], skipped: [], failed: [action.template.configurationKey] }
  }

  private async createIfAbsent(
    action: AuthorizedApplyConfigurationAction,
    destAbs: string,
    sidecarPath: string,
    op: ProvisioningOperation,
    journal: MutationJournalPort,
  ): Promise<ConfigurationApplicationResult> {
    const { template } = action
    if (await fileExists(destAbs)) {
      return { applied: [], skipped: [template.configurationKey], failed: [] }
    }

    const mutationId = newMutationId()
    const classification = action.mutationPolicy.mutating
      ? action.mutationPolicy.compensation
      : { kind: 'non-compensable' as const, approvedReasonCode: 'create-if-absent' }

    journal.prepareMutation(action.actionId, mutationId, op, classification)
    journal.startMutation(action.actionId, mutationId, op)

    await mkdir(dirname(destAbs), { recursive: true })
    await writeFile(destAbs, template.canonicalContent, 'utf8')

    const sidecar = await readSidecar(sidecarPath)
    const record: GeneratedFileRecord = {
      path: template.destination,
      templateId: template.templateId,
      contentHash: sha256(template.canonicalContent),
      authorizationId: action.authorization.authorizationId,
      actionId: action.actionId,
    }
    sidecar.files = sidecar.files.filter(f => f.path !== template.destination)
    sidecar.files.push(record)
    await mkdir(dirname(sidecarPath), { recursive: true })
    await writeFile(sidecarPath, JSON.stringify(sidecar), 'utf8')

    const compensation = action.mutationPolicy.mutating
      ? (action.mutationPolicy.compensation as { kind: string; parameters: Record<string, string | number | boolean> })
      : undefined
    journal.recordSuccess(action.actionId, mutationId, op, compensation)

    return { applied: [template.configurationKey], skipped: [], failed: [] }
  }

  private async replaceAuthorized(
    action: AuthorizedApplyConfigurationAction,
    destAbs: string,
    sidecarPath: string,
    op: ProvisioningOperation,
    journal: MutationJournalPort,
  ): Promise<ConfigurationApplicationResult> {
    const { template } = action
    const key = template.configurationKey

    const sidecar = await readSidecar(sidecarPath)
    const record = sidecar.files.find(f => f.path === template.destination)
    if (!record) {
      return this.failUnauthorized(action, mutationId => this.journalFailure(journal, action, mutationId, op, 'UNAUTHORIZED_FILE_REPLACE'), key)
    }

    // Verify current file hash matches sidecar record
    let currentContent: string
    try {
      currentContent = await readFile(destAbs, 'utf8')
    } catch {
      return this.failUnauthorized(action, mutationId => this.journalFailure(journal, action, mutationId, op, 'UNAUTHORIZED_FILE_REPLACE'), key)
    }
    if (sha256(currentContent) !== record.contentHash) {
      return this.failUnauthorized(action, mutationId => this.journalFailure(journal, action, mutationId, op, 'UNAUTHORIZED_FILE_REPLACE'), key)
    }

    const mutationId = newMutationId()
    journal.prepareMutation(action.actionId, mutationId, op, action.mutationPolicy.mutating ? action.mutationPolicy.compensation : { kind: 'non-compensable', approvedReasonCode: 'replace' })
    journal.startMutation(action.actionId, mutationId, op)

    // Two-phase atomic commit
    const destTmp = destAbs + '.rhk-tmp'
    const sidecarTmp = sidecarPath + '.rhk-tmp'

    await mkdir(dirname(destAbs), { recursive: true })
    await writeFile(destTmp, template.canonicalContent, 'utf8')

    const updatedRecord: GeneratedFileRecord = {
      path: template.destination,
      templateId: template.templateId,
      contentHash: sha256(template.canonicalContent),
      authorizationId: action.authorization.authorizationId,
      actionId: action.actionId,
    }
    const updatedSidecar: ProvenanceSidecar = {
      files: [...sidecar.files.filter(f => f.path !== template.destination), updatedRecord],
    }
    await mkdir(dirname(sidecarPath), { recursive: true })
    await writeFile(sidecarTmp, JSON.stringify(updatedSidecar), 'utf8')

    try {
      await rename(destTmp, destAbs)
      await rename(sidecarTmp, sidecarPath)
    } catch (err) {
      await Promise.allSettled([
        unlink(destTmp).catch(() => {}),
        unlink(sidecarTmp).catch(() => {}),
      ])
      throw err
    }

    const compensation = action.mutationPolicy.mutating
      ? (action.mutationPolicy.compensation as { kind: string; parameters: Record<string, string | number | boolean> })
      : undefined
    journal.recordSuccess(action.actionId, mutationId, op, compensation)

    return { applied: [key], skipped: [], failed: [] }
  }

  private async failUnauthorized(
    action: AuthorizedApplyConfigurationAction,
    journalFn: (mid: ProvisioningMutationId) => void,
    key: string,
  ): Promise<ConfigurationApplicationResult> {
    const mutationId = newMutationId()
    journalFn(mutationId)
    return { applied: [], skipped: [], failed: [key] }
  }

  private journalFailure(
    journal: MutationJournalPort,
    action: AuthorizedApplyConfigurationAction,
    mutationId: ProvisioningMutationId,
    op: ProvisioningOperation,
    code: string,
  ): void {
    const classification = action.mutationPolicy.mutating
      ? action.mutationPolicy.compensation
      : { kind: 'non-compensable' as const, approvedReasonCode: 'replace' }
    journal.prepareMutation(action.actionId, mutationId, op, classification)
    journal.startMutation(action.actionId, mutationId, op)
    journal.recordFailure(action.actionId, mutationId, op, [code as ProvisioningDiagnosticCode], [])
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function readSidecar(sidecarPath: string): Promise<ProvenanceSidecar> {
  try {
    const raw = await readFile(sidecarPath, 'utf8')
    return JSON.parse(raw) as ProvenanceSidecar
  } catch {
    return { files: [] }
  }
}
