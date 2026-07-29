import { createReadStream } from 'node:fs'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { ArtifactByteReader, InertArtifactHandle } from '@rohinik-org/package-trust-ir'

// stagingRoot is the only absolute path — never surfaces in the public API
export class NodeArtifactByteReader implements ArtifactByteReader {
  constructor(private readonly stagingRoot: string) {}

  async *streamArtifact(handle: InertArtifactHandle): AsyncIterable<Uint8Array> {
    const absolutePath = join(this.stagingRoot, handle.stagingId, handle.relativeArtifactPath)
    const stream = createReadStream(absolutePath)

    for await (const chunk of stream) {
      yield chunk as Uint8Array
    }
  }

  async dispose(handle: InertArtifactHandle): Promise<void> {
    const dir = join(this.stagingRoot, handle.stagingId)
    await rm(dir, { recursive: true, force: true })
  }
}
