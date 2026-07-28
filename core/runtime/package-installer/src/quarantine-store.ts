import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import type {
  ProvisioningWorkspace,
  ArtifactAuthorizationId,
  QuarantineWriteHandle,
  QuarantinedArtifactHandle,
  QuarantinePath,
  WorkspaceRelativePath,
} from '@rohinik-org/provisioning-ir'
import { SafeWorkspace } from './safe-workspace.js'

export class QuarantineStore {
  constructor(
    private readonly workspace: ProvisioningWorkspace,
    private readonly safeWorkspace: SafeWorkspace,
  ) {}

  // Creates a new write handle for downloading an artifact to quarantine
  createWriteHandle(artifactAuthorizationId: ArtifactAuthorizationId): QuarantineWriteHandle {
    const quarantineFileName = `${artifactAuthorizationId as string}.download`
    const quarantinePath = path.join(this.workspace.quarantineRoot as string, quarantineFileName) as QuarantinePath
    return { quarantinePath, artifactAuthorizationId }
  }

  // Returns absolute path for an existing quarantine file
  resolveQuarantinePath(handle: QuarantinedArtifactHandle): string {
    return this.safeWorkspace.resolveExistingPath(handle.quarantinePath as unknown as WorkspaceRelativePath)
  }

  async ensureQuarantineDirExists(): Promise<void> {
    const dir = this.safeWorkspace.resolveNewPath(this.workspace.quarantineRoot as unknown as WorkspaceRelativePath)
    await fs.mkdir(dir, { recursive: true })
  }

  async deleteQuarantineFile(handle: QuarantinedArtifactHandle): Promise<void> {
    const absolutePath = this.resolveQuarantinePath(handle)
    await fs.unlink(absolutePath)
  }
}
