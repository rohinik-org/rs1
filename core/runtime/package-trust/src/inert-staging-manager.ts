import { randomBytes } from 'node:crypto'
import { mkdir, rename, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type {
  AcquisitionAuthorization,
  InertArtifactHandle,
  StagingId,
} from '@rohinik-org/package-trust-ir'

export class InertStagingManager {
  constructor(private readonly stagingRoot: string) {}

  async acquireToInertStaging(
    authorization: AcquisitionAuthorization,
    sourceBytes: AsyncIterable<Uint8Array>,
  ): Promise<InertArtifactHandle> {
    const stagingId = randomBytes(16).toString('hex') as StagingId
    const stagingDir = join(this.stagingRoot, stagingId)
    await mkdir(stagingDir, { recursive: true })

    const artifactFile = 'artifact.bin'
    const tempFile = join(stagingDir, `${artifactFile}.tmp`)
    const finalFile = join(stagingDir, artifactFile)

    const { createWriteStream } = await import('node:fs')
    const ws = createWriteStream(tempFile)
    let sizeBytes = 0
    for await (const chunk of sourceBytes) {
      sizeBytes += chunk.length
      ws.write(chunk)
    }
    await new Promise<void>((res, rej) => ws.end((err: Error | null | undefined) => err ? rej(err) : res()))

    // atomic write
    await rename(tempFile, finalFile)

    return {
      stagingId,
      subject: authorization.subject,
      relativeArtifactPath: artifactFile,
      sizeBytes,
      acquiredFrom: authorization.subject.sourceIdentity,
    }
  }

  getArtifactPath(handle: InertArtifactHandle): string {
    // L-9J-006: segment-level path traversal check
    const segments = handle.relativeArtifactPath.split('/')
    for (const seg of segments) {
      if (seg === '..') {
        throw new Error(`InertStagingManager: path traversal detected in ${handle.relativeArtifactPath}`)
      }
    }
    return resolve(join(this.stagingRoot, handle.stagingId, handle.relativeArtifactPath))
  }

  async cleanup(handle: InertArtifactHandle): Promise<void> {
    const dir = join(this.stagingRoot, handle.stagingId)
    await rm(dir, { recursive: true, force: true })
  }
}
