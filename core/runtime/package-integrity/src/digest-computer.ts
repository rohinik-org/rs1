import { createHash } from 'node:crypto'
import type { ArtifactByteReader, InertArtifactHandle, IntegrityDigest } from '@rohinik-org/package-trust-ir'

export type DigestComputationResult =
  | { readonly computed: true; readonly digest: IntegrityDigest }
  | { readonly computed: false; readonly reason: 'artifact-read-failed'; readonly cause?: unknown }

function toSriBase64(algorithm: 'sha256' | 'sha512', raw: Buffer): string {
  return `${algorithm}-${raw.toString('base64')}`
}

export class DigestComputer {
  async compute(
    handle: InertArtifactHandle,
    reader: ArtifactByteReader,
    algorithm: 'sha256' | 'sha512',
    encoding: 'hex' | 'sri-base64',
  ): Promise<DigestComputationResult> {
    const nodeAlgorithm = algorithm === 'sha256' ? 'sha256' : 'sha512'
    const hash = createHash(nodeAlgorithm)

    try {
      for await (const chunk of reader.streamArtifact(handle)) {
        hash.update(chunk)
      }
    } catch (cause) {
      return { computed: false, reason: 'artifact-read-failed', cause }
    }

    const raw = hash.digest()
    const value = encoding === 'hex' ? raw.toString('hex') : toSriBase64(algorithm, raw)

    return { computed: true, digest: { algorithm, encoding, value } }
  }
}
