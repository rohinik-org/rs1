import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdir, rm } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { NodeArtifactByteReader } from '../artifact-byte-reader.js'
import { InertStagingManager } from '../inert-staging-manager.js'
import type { ExternalSourceIdentity, PackageTrustSubject, IntegrityDigest } from '@rohinik-org/package-trust-ir'

const INTEGRITY: IntegrityDigest = { algorithm: 'sha256', encoding: 'hex', value: 'aabbcc' }

function makeSourceIdentity(): ExternalSourceIdentity {
  return { sourceKind: 'npm-registry', registryId: 'registry.npmjs.org', artifactLocator: 'a/-/a-1.0.0.tgz' }
}

function makeSubject(): PackageTrustSubject {
  return { subjectKind: 'language-dependency', packageId: 'a', version: '1.0.0', sourceIdentity: makeSourceIdentity(), expectedIntegrity: INTEGRITY }
}

const TEST_BYTES = new TextEncoder().encode('streaming-content')

describe('NodeArtifactByteReader', () => {
  let stagingRoot: string
  let stagingManager: InertStagingManager
  let reader: NodeArtifactByteReader

  beforeEach(async () => {
    stagingRoot = join(tmpdir(), `byte-reader-test-${randomUUID()}`)
    await mkdir(stagingRoot, { recursive: true })
    stagingManager = new InertStagingManager(stagingRoot)
    reader = new NodeArtifactByteReader(stagingRoot)
  })

  afterEach(async () => {
    await rm(stagingRoot, { recursive: true, force: true })
  })

  it('streams artifact bytes', async () => {
    const allocation = await stagingManager.allocate('a-1.0.0.tgz')
    await stagingManager.writeBytes(allocation, TEST_BYTES)
    const handle = stagingManager.buildHandle(allocation, makeSubject(), TEST_BYTES.byteLength, makeSourceIdentity())

    const chunks: Uint8Array[] = []
    for await (const chunk of reader.streamArtifact(handle)) {
      chunks.push(chunk)
    }

    const combined = new Uint8Array(chunks.reduce((acc, c) => acc + c.byteLength, 0))
    let offset = 0
    for (const chunk of chunks) {
      combined.set(chunk, offset)
      offset += chunk.byteLength
    }

    expect(combined).toEqual(TEST_BYTES)
  })

  it('dispose removes staging directory', async () => {
    const allocation = await stagingManager.allocate('a-1.0.0.tgz')
    await stagingManager.writeBytes(allocation, TEST_BYTES)
    const handle = stagingManager.buildHandle(allocation, makeSubject(), TEST_BYTES.byteLength, makeSourceIdentity())

    expect(await stagingManager.exists(handle.stagingId)).toBe(true)
    await reader.dispose(handle)
    expect(await stagingManager.exists(handle.stagingId)).toBe(false)
  })

  it('handle carries no absolute path in stagingId or relativeArtifactPath', async () => {
    const allocation = await stagingManager.allocate('a-1.0.0.tgz')
    await stagingManager.writeBytes(allocation, TEST_BYTES)
    const handle = stagingManager.buildHandle(allocation, makeSubject(), TEST_BYTES.byteLength, makeSourceIdentity())

    expect(handle.stagingId).not.toContain(stagingRoot)
    expect(handle.relativeArtifactPath).not.toContain(stagingRoot)
  })
})
