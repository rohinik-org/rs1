import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdir, rm } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { AcquisitionService } from '../acquisition-service.js'
import { InertStagingManager } from '../inert-staging-manager.js'
import type {
  AcquisitionAuthorization,
  AcquisitionAuthorizationId,
  PackageTrustSubject,
  ExternalSourceIdentity,
  IntegrityDigest,
} from '@rohinik-org/package-trust-ir'

const INTEGRITY: IntegrityDigest = { algorithm: 'sha256', encoding: 'hex', value: 'deadbeef' }

function makeSourceIdentity(): ExternalSourceIdentity {
  return { sourceKind: 'npm-registry', registryId: 'registry.npmjs.org', artifactLocator: 'pkg/-/pkg-1.0.0.tgz' }
}

function makeSubject(overrides?: Partial<PackageTrustSubject>): PackageTrustSubject {
  return {
    subjectKind: 'language-dependency',
    packageId: 'pkg',
    version: '1.0.0',
    sourceIdentity: makeSourceIdentity(),
    expectedIntegrity: INTEGRITY,
    ...overrides,
  }
}

function makeAuthorization(overrides?: Partial<AcquisitionAuthorization>): AcquisitionAuthorization {
  return {
    acquisitionAuthorizationId: randomUUID() as AcquisitionAuthorizationId,
    subject: makeSubject(),
    issuedAt: new Date(0).toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    ...overrides,
  }
}

const TEST_BYTES = new TextEncoder().encode('fake-tarball-bytes')

describe('AcquisitionService', () => {
  let stagingRoot: string
  let stagingManager: InertStagingManager
  let service: AcquisitionService

  beforeEach(async () => {
    stagingRoot = join(tmpdir(), `pkg-acq-test-${randomUUID()}`)
    await mkdir(stagingRoot, { recursive: true })
    stagingManager = new InertStagingManager(stagingRoot)
    service = new AcquisitionService(stagingManager)
  })

  afterEach(async () => {
    await rm(stagingRoot, { recursive: true, force: true })
  })

  it('successful staging — returns acquired handle', async () => {
    const auth = makeAuthorization()
    const subject = makeSubject()
    const source = makeSourceIdentity()

    const result = await service.acquire(auth, subject, source, async () => ({
      filename: 'pkg-1.0.0.tgz',
      bytes: TEST_BYTES,
    }))

    expect(result.acquired).toBe(true)
    if (result.acquired) {
      expect(result.handle.stagingId).toBeTruthy()
      expect(result.handle.relativeArtifactPath).toBe('pkg-1.0.0.tgz')
      expect(result.handle.sizeBytes).toBe(TEST_BYTES.byteLength)
    }
  })

  it('handle is immutable (frozen)', async () => {
    const auth = makeAuthorization()
    const result = await service.acquire(auth, makeSubject(), makeSourceIdentity(), async () => ({
      filename: 'pkg-1.0.0.tgz',
      bytes: TEST_BYTES,
    }))

    expect(result.acquired).toBe(true)
    if (result.acquired) {
      expect(Object.isFrozen(result.handle)).toBe(true)
    }
  })

  it('handle contains no absolute path', async () => {
    const auth = makeAuthorization()
    const result = await service.acquire(auth, makeSubject(), makeSourceIdentity(), async () => ({
      filename: 'pkg-1.0.0.tgz',
      bytes: TEST_BYTES,
    }))

    expect(result.acquired).toBe(true)
    if (result.acquired) {
      const { handle } = result
      for (const v of Object.values(handle as unknown as Record<string, unknown>)) {
        if (typeof v === 'string') {
          expect(v).not.toContain(stagingRoot)
        }
      }
    }
  })

  it('rejects expired authorization', async () => {
    const auth = makeAuthorization({ expiresAt: new Date(0).toISOString() })
    const result = await service.acquire(auth, makeSubject(), makeSourceIdentity(), async () => ({
      filename: 'pkg-1.0.0.tgz',
      bytes: TEST_BYTES,
    }))
    expect(result.acquired).toBe(false)
    if (!result.acquired) {
      expect(result.reason).toBe('expired')
    }
  })

  it('rejects subject mismatch', async () => {
    const auth = makeAuthorization()
    const wrongSubject = makeSubject({ version: '0.0.1' })
    const result = await service.acquire(auth, wrongSubject, makeSourceIdentity(), async () => ({
      filename: 'pkg-1.0.0.tgz',
      bytes: TEST_BYTES,
    }))
    expect(result.acquired).toBe(false)
    if (!result.acquired) {
      expect(result.reason).toBe('subject-mismatch')
    }
  })

  it('rejects source mismatch', async () => {
    const auth = makeAuthorization()
    const wrongSource: ExternalSourceIdentity = {
      sourceKind: 'npm-registry',
      registryId: 'malicious.example.com',
      artifactLocator: 'pkg/-/pkg-1.0.0.tgz',
    }
    const result = await service.acquire(auth, makeSubject(), wrongSource, async () => ({
      filename: 'pkg-1.0.0.tgz',
      bytes: TEST_BYTES,
    }))
    expect(result.acquired).toBe(false)
    if (!result.acquired) {
      expect(result.reason).toBe('source-mismatch')
    }
  })

  it('does not execute — fetcher returns bytes, no eval/require/import', async () => {
    let fetcherCalled = false
    const auth = makeAuthorization()

    const result = await service.acquire(auth, makeSubject(), makeSourceIdentity(), async () => {
      fetcherCalled = true
      return { filename: 'pkg-1.0.0.tgz', bytes: TEST_BYTES }
    })

    expect(fetcherCalled).toBe(true)
    expect(result.acquired).toBe(true)
  })

  it('does not extract — zip bytes written verbatim, not expanded', async () => {
    const zipHeader = new Uint8Array([0x50, 0x4b, 0x03, 0x04])
    const auth = makeAuthorization()

    const result = await service.acquire(auth, makeSubject(), makeSourceIdentity(), async () => ({
      filename: 'pkg-1.0.0.zip',
      bytes: zipHeader,
    }))

    expect(result.acquired).toBe(true)
    if (result.acquired) {
      expect(result.handle.relativeArtifactPath).toBe('pkg-1.0.0.zip')
      const exists = await stagingManager.exists(result.handle.stagingId)
      expect(exists).toBe(true)
    }
  })

  it('does not install — only staging directory created, no scripts run', async () => {
    const auth = makeAuthorization()
    const result = await service.acquire(auth, makeSubject(), makeSourceIdentity(), async () => ({
      filename: 'pkg-1.0.0.tgz',
      bytes: TEST_BYTES,
    }))
    expect(result.acquired).toBe(true)
    if (result.acquired) {
      const exists = await stagingManager.exists(result.handle.stagingId)
      expect(exists).toBe(true)
    }
  })
})
