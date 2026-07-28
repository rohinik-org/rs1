import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import https from 'node:https'
import http from 'node:http'
import fs from 'node:fs'
import type {
  ArtifactDigestMatchPort,
  ArtifactMatchResult,
  VerifiedArtifactAuthorization,
  QuarantinedArtifactHandle,
  AuthorizedArtifactDigest,
  ProvisioningDiagnosticId,
  DigestPrefix,
  ArtifactFetchPort,
  FetchResult,
  AuthorizedArtifactSource,
  QuarantineWriteHandle,
} from '@rohinik-org/provisioning-ir'

export class ArtifactDigestMatcher implements ArtifactDigestMatchPort {
  async matchStream(
    input: AsyncIterable<Uint8Array>,
    authorization: VerifiedArtifactAuthorization,
  ): Promise<ArtifactMatchResult> {
    const computed = await computeDigest(input, authorization.digest)
    return compare(computed, authorization.digest)
  }

  async matchFile(
    handle: QuarantinedArtifactHandle,
    authorization: VerifiedArtifactAuthorization,
  ): Promise<ArtifactMatchResult> {
    const stream = createReadStream(handle.quarantinePath as string)
    return this.matchStream(stream as unknown as AsyncIterable<Uint8Array>, authorization)
  }
}

async function computeDigest(input: AsyncIterable<Uint8Array>, digest: AuthorizedArtifactDigest): Promise<string> {
  if (digest.algorithm === 'sha256') {
    const hash = createHash('sha256')
    for await (const chunk of input) hash.update(chunk)
    return hash.digest('hex')
  } else {
    const hash = createHash('sha512')
    for await (const chunk of input) hash.update(chunk)
    return `sha512-${hash.digest('base64')}`
  }
}

function digestPrefix(value: string, algorithm: AuthorizedArtifactDigest['algorithm']): DigestPrefix {
  // sha256: first 8 hex chars of value
  // sha512: first 8 base64 chars after stripping "sha512-" (7 chars)
  const raw = algorithm === 'sha512' ? value.slice(7, 15) : value.slice(0, 8)
  return raw as DigestPrefix
}

function compare(computed: string, expected: AuthorizedArtifactDigest): ArtifactMatchResult {
  if (computed === expected.value) return { matched: true }
  return {
    matched: false,
    diagnosticId: `diag-${Date.now()}` as ProvisioningDiagnosticId,
    expectedDigestPrefix: digestPrefix(expected.value, expected.algorithm),
    computedDigestPrefix: digestPrefix(computed, expected.algorithm),
  }
}

export class HttpArtifactFetcher implements ArtifactFetchPort {
  async fetch(source: AuthorizedArtifactSource, destination: QuarantineWriteHandle): Promise<FetchResult> {
    const destPath = destination.quarantinePath as string

    if (source.sourceKind === 'uri') {
      const mod = source.uri.startsWith('https:') ? https : http
      return new Promise((resolve, reject) => {
        const writeStream = fs.createWriteStream(destPath)
        let bytesWritten = 0
        const fail = (err: unknown) => { writeStream.destroy(); reject(err) }
        mod.get(source.uri, (res) => {
          res.on('data', (chunk: Buffer) => { bytesWritten += chunk.length })
          res.pipe(writeStream)
          writeStream.on('finish', () => resolve({
            bytesWritten,
            quarantineHandle: { quarantinePath: destination.quarantinePath, artifactAuthorizationId: destination.artifactAuthorizationId },
            effectiveSource: source,
          }))
          writeStream.on('error', fail)
        }).on('error', fail)
      })
    }

    if (source.sourceKind === 'workspace-artifact') {
      const readStream = fs.createReadStream(source.path as string)
      const writeStream = fs.createWriteStream(destPath)
      let bytesWritten = 0
      readStream.on('data', (chunk: Buffer | string) => { bytesWritten += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk) })
      return new Promise((resolve, reject) => {
        const fail = (err: unknown) => { readStream.destroy(); writeStream.destroy(); reject(err) }
        readStream.pipe(writeStream)
        writeStream.on('finish', () => resolve({
          bytesWritten,
          quarantineHandle: { quarantinePath: destination.quarantinePath, artifactAuthorizationId: destination.artifactAuthorizationId },
          effectiveSource: source,
        }))
        writeStream.on('error', fail)
        readStream.on('error', fail)
      })
    }

    throw new Error(`HttpArtifactFetcher: sourceKind '${source.sourceKind}' not supported`)
  }
}
