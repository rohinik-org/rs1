import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdir, rm } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { StagingCleaner } from '../staging-cleaner.js'
import { InertStagingManager } from '../inert-staging-manager.js'
import type { ExternalSourceIdentity, PackageTrustSubject, IntegrityDigest } from '@rohinik-org/package-trust-ir'

const INTEGRITY: IntegrityDigest = { algorithm: 'sha256', encoding: 'hex', value: 'cc00ff' }

function makeSourceIdentity(): ExternalSourceIdentity {
  return { sourceKind: 'npm-registry', registryId: 'registry.npmjs.org', artifactLocator: 'b/-/b-1.0.0.tgz' }
}

function makeSubject(): PackageTrustSubject {
  return { subjectKind: 'language-dependency', packageId: 'b', version: '1.0.0', sourceIdentity: makeSourceIdentity(), expectedIntegrity: INTEGRITY }
}

describe('StagingCleaner', () => {
  let stagingRoot: string
  let stagingManager: InertStagingManager
  let cleaner: StagingCleaner

  beforeEach(async () => {
    stagingRoot = join(tmpdir(), `staging-cleaner-test-${randomUUID()}`)
    await mkdir(stagingRoot, { recursive: true })
    stagingManager = new InertStagingManager(stagingRoot)
    cleaner = new StagingCleaner(stagingRoot)
  })

  afterEach(async () => {
    await rm(stagingRoot, { recursive: true, force: true })
  })

  it('removeStaging removes specific staging directory', async () => {
    const alloc = await stagingManager.allocate('b-1.0.0.tgz')
    await stagingManager.writeBytes(alloc, new Uint8Array([1, 2, 3]))

    expect(await stagingManager.exists(alloc.stagingId)).toBe(true)
    await cleaner.removeStaging(alloc.stagingId)
    expect(await stagingManager.exists(alloc.stagingId)).toBe(false)
  })

  it('removeAll removes all staging directories', async () => {
    const alloc1 = await stagingManager.allocate('b-1.0.0.tgz')
    const alloc2 = await stagingManager.allocate('b-2.0.0.tgz')
    await stagingManager.writeBytes(alloc1, new Uint8Array([1]))
    await stagingManager.writeBytes(alloc2, new Uint8Array([2]))

    await cleaner.removeAll()

    expect(await stagingManager.exists(alloc1.stagingId)).toBe(false)
    expect(await stagingManager.exists(alloc2.stagingId)).toBe(false)
  })

  it('removeAll is idempotent on empty staging root', async () => {
    await expect(cleaner.removeAll()).resolves.toBeUndefined()
  })

  it('cleanup — acquired artifact is removed after cleanup', async () => {
    const alloc = await stagingManager.allocate('b-1.0.0.tgz')
    await stagingManager.writeBytes(alloc, new Uint8Array([9, 8, 7]))

    const handle = stagingManager.buildHandle(alloc, makeSubject(), 3, makeSourceIdentity())

    await cleaner.removeStaging(handle.stagingId)
    expect(await stagingManager.exists(handle.stagingId)).toBe(false)
  })
})
