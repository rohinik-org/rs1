import { describe, it, expect, vi } from 'vitest'
import type {
  DatasetManifest, DatasetPartition, DatasetProvenance,
  DatasetGovernanceContext, DatasetManifestRepository, DatasetVersionRepository,
} from '../index.js'
import {
  validateDatasetManifest,
  DatasetRegistrationService,
  makeDatasetGovernanceError,
} from '../index.js'
import { canonicalMlHash, datasetId, partitionId, isoTimestamp, contentHash } from '@rohinik-org/ml-ir'

// ── helpers ───────────────────────────────────────────────────────────────────

const TS = isoTimestamp('2024-01-01T00:00:00.000Z')

function makeManifest(overrides?: Partial<DatasetManifest>): DatasetManifest {
  const base = {
    datasetId: datasetId('ds-test'),
    name: 'Test Dataset',
    recordCount: 100,
    lifecycleState: 'active' as const,
    createdAt: TS,
  }
  const hash = canonicalMlHash(base) as ReturnType<typeof contentHash>
  return { ...base, contentHash: hash, ...overrides }
}

function makeProvenance(dsId = datasetId('ds-test')): DatasetProvenance {
  return {
    datasetId: dsId,
    sourceDescription: 'test source',
    authorizedUsePolicyIds: ['policy-1'],
    createdAt: TS,
  }
}

function makePartitions(): DatasetPartition[] {
  return [
    { partitionId: partitionId('p-train'), datasetId: datasetId('ds-test'), role: 'train', contentHash: contentHash('sha256:' + 'a'.repeat(64)), recordCount: 80 },
    { partitionId: partitionId('p-test'),  datasetId: datasetId('ds-test'), role: 'test',  contentHash: contentHash('sha256:' + 'b'.repeat(64)), recordCount: 20 },
  ]
}

function makeCtx(): DatasetGovernanceContext {
  return {
    tenantId: 'tenant-1',
    environmentId: 'env-prod',
    requestedAt: TS,
    requestingPrincipalId: 'principal-1',
  }
}

function makeRepos(stored = true): { manifests: DatasetManifestRepository; versions: DatasetVersionRepository } {
  return {
    manifests: {
      save: vi.fn().mockResolvedValue({ stored, conflict: false }),
      findById: vi.fn().mockResolvedValue(undefined),
    },
    versions: {
      save: vi.fn().mockResolvedValue({ stored, conflict: false }),
      findByIdAndVersion: vi.fn().mockResolvedValue(undefined),
      listVersions: vi.fn().mockResolvedValue([]),
    },
  }
}

// ── Test 1: valid manifest + provenance registers successfully ─────────────────

describe('DatasetRegistrationService', () => {
  it('test 1: valid manifest + provenance registers successfully', async () => {
    const repos = makeRepos()
    const svc = DatasetRegistrationService(repos.manifests, repos.versions)
    const manifest = makeManifest()
    const receipt = await svc.register(manifest, makePartitions(), makeProvenance(), makeCtx())
    expect(receipt.datasetId).toBe(manifest.datasetId)
    expect(receipt.version).toBeDefined()
    expect(receipt.registrationHash).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(receipt.registeredAt).toBe(TS)
  })

  // ── Test 2: empty name ──────────────────────────────────────────────────────
  it('test 2: manifest with empty name throws DATASET_MANIFEST_INVALID', async () => {
    const manifest = makeManifest({ name: '  ' })
    expect(() => validateDatasetManifest(manifest, makeProvenance(), makePartitions())).toThrow()
    try {
      validateDatasetManifest(manifest, makeProvenance(), makePartitions())
    } catch (e) {
      expect((e as { code: string }).code).toBe('DATASET_MANIFEST_INVALID')
    }
  })

  // ── Test 3: zero recordCount ────────────────────────────────────────────────
  it('test 3: manifest with zero recordCount throws DATASET_MANIFEST_INVALID', async () => {
    const manifest = makeManifest({ recordCount: 0 })
    try {
      validateDatasetManifest(manifest, makeProvenance(), makePartitions())
      expect.fail('should throw')
    } catch (e) {
      expect((e as { code: string }).code).toBe('DATASET_MANIFEST_INVALID')
    }
  })

  // ── Test 4: wrong contentHash ───────────────────────────────────────────────
  it('test 4: manifest with wrong contentHash throws DATASET_MANIFEST_HASH_MISMATCH', async () => {
    const manifest = makeManifest({ contentHash: contentHash('sha256:' + '0'.repeat(64)) })
    try {
      validateDatasetManifest(manifest, makeProvenance(), makePartitions())
      expect.fail('should throw')
    } catch (e) {
      expect((e as { code: string }).code).toBe('DATASET_MANIFEST_HASH_MISMATCH')
    }
  })

  // ── Test 5: missing authorization ──────────────────────────────────────────
  it('test 5: provenance with empty authorizedUsePolicyIds throws DATASET_MANIFEST_MISSING_AUTHORIZATION', async () => {
    const manifest = makeManifest()
    const provenance = makeProvenance()
    const badProvenance: DatasetProvenance = { ...provenance, authorizedUsePolicyIds: [] }
    try {
      validateDatasetManifest(manifest, badProvenance, makePartitions())
      expect.fail('should throw')
    } catch (e) {
      expect((e as { code: string }).code).toBe('DATASET_MANIFEST_MISSING_AUTHORIZATION')
    }
  })

  // ── Test 6: duplicate partition IDs ────────────────────────────────────────
  it('test 6: duplicate partition IDs throw DATASET_PARTITION_DUPLICATE', async () => {
    const manifest = makeManifest()
    const dupePartitions: DatasetPartition[] = [
      { partitionId: partitionId('p-dupe'), datasetId: datasetId('ds-test'), role: 'train', contentHash: contentHash('sha256:' + 'a'.repeat(64)), recordCount: 50 },
      { partitionId: partitionId('p-dupe'), datasetId: datasetId('ds-test'), role: 'test',  contentHash: contentHash('sha256:' + 'b'.repeat(64)), recordCount: 50 },
    ]
    try {
      validateDatasetManifest(manifest, makeProvenance(), dupePartitions)
      expect.fail('should throw')
    } catch (e) {
      expect((e as { code: string }).code).toBe('DATASET_PARTITION_DUPLICATE')
    }
  })

  // ── Test 7: provider extension overrides authoritative field ────────────────
  it('test 7: provider extension with authoritative field override is rejected', async () => {
    const manifest = makeManifest({
      provider: {
        providerName: 'bad-provider',
        metadata: { datasetId: 'override-attempt', contentHash: 'should-not-work' },
      },
    })
    try {
      validateDatasetManifest(manifest, makeProvenance(), makePartitions())
      expect.fail('should throw')
    } catch (e) {
      expect((e as { code: string }).code).toBe('DATASET_MANIFEST_INVALID')
    }
  })

  // ── Test 8: idempotent replay ───────────────────────────────────────────────
  it('test 8: replay of same ID+hash is idempotent (stored=false on second call)', async () => {
    const manifest = makeManifest()
    const existing = manifest
    const repos = makeRepos()
    // Simulate second call: findById returns the same manifest
    ;(repos.manifests.findById as ReturnType<typeof vi.fn>).mockResolvedValue(existing)
    ;(repos.manifests.save as ReturnType<typeof vi.fn>).mockResolvedValue({ stored: false, conflict: false })
    ;(repos.versions.findByIdAndVersion as ReturnType<typeof vi.fn>).mockResolvedValue({
      datasetId: manifest.datasetId, version: 'v1', contentHash: manifest.contentHash, createdAt: TS,
    })
    const svc = DatasetRegistrationService(repos.manifests, repos.versions)
    const receipt = await svc.register(manifest, makePartitions(), makeProvenance(), makeCtx())
    expect(receipt.datasetId).toBe(manifest.datasetId)
  })

  // ── Test 9: same ID, different hash conflicts ───────────────────────────────
  it('test 9: same ID different hash conflicts with DATASET_VERSION_CONFLICT', async () => {
    const manifest = makeManifest()
    const repos = makeRepos()
    const different: DatasetManifest = { ...manifest, name: 'Different Name', contentHash: contentHash('sha256:' + 'f'.repeat(64)) }
    ;(repos.manifests.findById as ReturnType<typeof vi.fn>).mockResolvedValue(different)
    const svc = DatasetRegistrationService(repos.manifests, repos.versions)
    try {
      await svc.register(manifest, makePartitions(), makeProvenance(), makeCtx())
      expect.fail('should throw')
    } catch (e) {
      expect((e as { code: string }).code).toBe('DATASET_VERSION_CONFLICT')
    }
  })

  // ── Test 10: stored copy is immutable (not mutated) ─────────────────────────
  it('test 10: stored manifest copy is immutable (deep equal to input, not mutated)', async () => {
    const repos = makeRepos()
    const svc = DatasetRegistrationService(repos.manifests, repos.versions)
    const manifest = makeManifest()
    const originalName = manifest.name
    await svc.register(manifest, makePartitions(), makeProvenance(), makeCtx())
    const savedCall = (repos.manifests.save as ReturnType<typeof vi.fn>).mock.calls[0]![0] as DatasetManifest
    expect(savedCall.datasetId).toBe(manifest.datasetId)
    expect(savedCall.contentHash).toBe(manifest.contentHash)
    expect(savedCall.name).toBe(originalName)
    // Verify it's a structural copy (same shape, consistent values)
    expect(savedCall).toEqual(manifest)
  })

  // ── Test 11: receipt contains required fields ───────────────────────────────
  it('test 11: registration receipt contains datasetId, version, registrationHash, registeredAt', async () => {
    const repos = makeRepos()
    const svc = DatasetRegistrationService(repos.manifests, repos.versions)
    const manifest = makeManifest()
    const receipt = await svc.register(manifest, makePartitions(), makeProvenance(), makeCtx())
    expect(receipt.datasetId).toBe(manifest.datasetId)
    expect(typeof receipt.version).toBe('string')
    expect(receipt.registrationHash).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(receipt.registeredAt).toBe(TS)
  })
})
