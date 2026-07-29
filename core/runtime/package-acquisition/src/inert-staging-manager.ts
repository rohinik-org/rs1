import { randomUUID } from 'node:crypto'
import { mkdir, writeFile, rm, access } from 'node:fs/promises'
import { join } from 'node:path'
import type { StagingId, PackageTrustSubject, ExternalSourceIdentity, InertArtifactHandle } from '@rohinik-org/package-trust-ir'

export interface StagingAllocation {
  readonly stagingId: StagingId
  // relativeArtifactPath is relative to the staging root — never an absolute path outside this package
  readonly relativeArtifactPath: string
  // absoluteStagingPath is internal only — never exposed via InertArtifactHandle
  readonly absoluteStagingPath: string
}

export class InertStagingManager {
  // stagingRoot is kept private — absolute paths never leave this class
  constructor(private readonly stagingRoot: string) {}

  async allocate(filename: string): Promise<StagingAllocation> {
    const stagingId = randomUUID() as StagingId
    const absoluteStagingPath = join(this.stagingRoot, stagingId)
    await mkdir(absoluteStagingPath, { recursive: true })

    return {
      stagingId,
      relativeArtifactPath: filename,
      absoluteStagingPath,
    }
  }

  async writeBytes(allocation: StagingAllocation, bytes: Uint8Array): Promise<void> {
    const dest = join(allocation.absoluteStagingPath, allocation.relativeArtifactPath)
    await writeFile(dest, bytes)
  }

  async remove(stagingId: StagingId): Promise<void> {
    const dir = join(this.stagingRoot, stagingId)
    await rm(dir, { recursive: true, force: true })
  }

  async exists(stagingId: StagingId): Promise<boolean> {
    try {
      await access(join(this.stagingRoot, stagingId))
      return true
    } catch {
      return false
    }
  }

  // Returns an InertArtifactHandle — relativeArtifactPath is relative, not absolute
  buildHandle(
    allocation: StagingAllocation,
    subject: PackageTrustSubject,
    sizeBytes: number,
    acquiredFrom: ExternalSourceIdentity,
  ): InertArtifactHandle {
    return Object.freeze({
      stagingId: allocation.stagingId,
      subject,
      relativeArtifactPath: allocation.relativeArtifactPath,
      sizeBytes,
      acquiredFrom,
    })
  }
}
