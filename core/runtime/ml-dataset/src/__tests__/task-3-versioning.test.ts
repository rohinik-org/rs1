import { describe, it, expect } from 'vitest'
import {
  type DatasetId, type ContentHash, type DatasetIsoTimestamp,
  type GovernedDatasetVersion, type DatasetVersionLifecycleState,
  type GovernedDatasetVersionRepository, type RepositoryWriteOptions,
  type DatasetVersionSupersession,
  type DatasetVersionResolution,
  isValidDatasetVersionTransition,
  DATASET_VERSION_TERMINAL_STATES,
  DatasetVersionService,
  makeDatasetGovernanceError,
} from '../../src/index.js'

// ── helpers ───────────────────────────────────────────────────────────────────

function makeVersion(
  datasetId: string,
  version: string,
  state: DatasetVersionLifecycleState,
): GovernedDatasetVersion {
  return {
    datasetId: datasetId as DatasetId,
    version,
    contentHash: ('sha256:' + 'a'.repeat(64)) as ContentHash,
    createdAt: '2024-01-01T00:00:00.000Z' as DatasetIsoTimestamp,
    state,
  }
}

function makeInMemoryRepo(): GovernedDatasetVersionRepository & {
  _store: Map<string, GovernedDatasetVersion>
} {
  const store = new Map<string, GovernedDatasetVersion>()
  return {
    _store: store,
    async save(v, _opts) {
      const key = `${v.datasetId}:${v.version}`
      const existing = store.get(key)
      if (existing && existing.contentHash !== v.contentHash) {
        return { stored: false, conflict: true }
      }
      store.set(key, { ...v })
      return { stored: true, conflict: false }
    },
    async findByIdAndVersion(datasetId, version) {
      return store.get(`${datasetId}:${version}`)
    },
    async listVersions(datasetId) {
      return [...store.values()].filter(v => v.datasetId === datasetId)
    },
    async findLatestAdmitted(datasetId) {
      const admitted = [...store.values()]
        .filter(v => v.datasetId === datasetId && v.state === 'ADMITTED')
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      return admitted[0]
    },
    async saveSupersession(sup, _opts) {
      return { stored: true, conflict: false }
    },
    async findSupersession(datasetId, version) {
      return undefined
    },
  }
}

// ── isValidDatasetVersionTransition ──────────────────────────────────────────

describe('isValidDatasetVersionTransition', () => {
  it('DRAFT → ASSEMBLING is valid', () => {
    expect(isValidDatasetVersionTransition('DRAFT', 'ASSEMBLING')).toBe(true)
  })
  it('ASSEMBLING → VALIDATING is valid', () => {
    expect(isValidDatasetVersionTransition('ASSEMBLING', 'VALIDATING')).toBe(true)
  })
  it('VALIDATING → ADMITTED is valid', () => {
    expect(isValidDatasetVersionTransition('VALIDATING', 'ADMITTED')).toBe(true)
  })
  it('VALIDATING → RESTRICTED is valid', () => {
    expect(isValidDatasetVersionTransition('VALIDATING', 'RESTRICTED')).toBe(true)
  })
  it('VALIDATING → REJECTED is valid', () => {
    expect(isValidDatasetVersionTransition('VALIDATING', 'REJECTED')).toBe(true)
  })
  it('ADMITTED → SUPERSEDED is valid', () => {
    expect(isValidDatasetVersionTransition('ADMITTED', 'SUPERSEDED')).toBe(true)
  })
  it('ADMITTED → DELETION_PENDING is valid', () => {
    expect(isValidDatasetVersionTransition('ADMITTED', 'DELETION_PENDING')).toBe(true)
  })
  it('RESTRICTED → SUPERSEDED is valid', () => {
    expect(isValidDatasetVersionTransition('RESTRICTED', 'SUPERSEDED')).toBe(true)
  })
  it('RESTRICTED → DELETION_PENDING is valid', () => {
    expect(isValidDatasetVersionTransition('RESTRICTED', 'DELETION_PENDING')).toBe(true)
  })
  it('DELETION_PENDING → DELETED is valid', () => {
    expect(isValidDatasetVersionTransition('DELETION_PENDING', 'DELETED')).toBe(true)
  })
  it('DRAFT → ADMITTED is invalid (must go through ASSEMBLING→VALIDATING)', () => {
    expect(isValidDatasetVersionTransition('DRAFT', 'ADMITTED')).toBe(false)
  })
  it('ADMITTED → DRAFT is invalid (terminal reopen)', () => {
    expect(isValidDatasetVersionTransition('ADMITTED', 'DRAFT')).toBe(false)
  })
})

// ── DATASET_VERSION_TERMINAL_STATES ──────────────────────────────────────────

describe('DATASET_VERSION_TERMINAL_STATES', () => {
  it('contains REJECTED, DELETED, SUPERSEDED', () => {
    expect(DATASET_VERSION_TERMINAL_STATES.has('REJECTED')).toBe(true)
    expect(DATASET_VERSION_TERMINAL_STATES.has('DELETED')).toBe(true)
    expect(DATASET_VERSION_TERMINAL_STATES.has('SUPERSEDED')).toBe(true)
  })
  it('terminal states cannot transition to anything', () => {
    const targets: DatasetVersionLifecycleState[] = ['DRAFT', 'ASSEMBLING', 'VALIDATING', 'ADMITTED']
    for (const t of [...DATASET_VERSION_TERMINAL_STATES]) {
      for (const target of targets) {
        expect(isValidDatasetVersionTransition(t, target)).toBe(false)
      }
    }
  })
})

// ── DatasetVersionService ─────────────────────────────────────────────────────

describe('DatasetVersionService.transition', () => {
  it('transitions DRAFT → ASSEMBLING successfully', async () => {
    const repo = makeInMemoryRepo()
    const svc = DatasetVersionService(repo)
    const v = makeVersion('ds-001', 'v1', 'DRAFT')
    await repo.save(v, { idempotencyKey: 'k1' })
    const updated = await svc.transition('ds-001' as DatasetId, 'v1', 'ASSEMBLING', '2024-01-01T00:00:01.000Z' as DatasetIsoTimestamp)
    expect(updated.state).toBe('ASSEMBLING')
  })

  it('invalid transition throws DATASET_VERSION_INVALID_TRANSITION', async () => {
    const repo = makeInMemoryRepo()
    const svc = DatasetVersionService(repo)
    const v = makeVersion('ds-001', 'v1', 'ADMITTED')
    await repo.save(v, { idempotencyKey: 'k2' })
    await expect(
      svc.transition('ds-001' as DatasetId, 'v1', 'DRAFT', '2024-01-01T00:00:02.000Z' as DatasetIsoTimestamp),
    ).rejects.toMatchObject({ code: 'DATASET_VERSION_INVALID_TRANSITION' })
  })

  it('version not found throws DATASET_VERSION_NOT_FOUND', async () => {
    const repo = makeInMemoryRepo()
    const svc = DatasetVersionService(repo)
    await expect(
      svc.transition('ds-missing' as DatasetId, 'v1', 'ASSEMBLING', '2024-01-01T00:00:00.000Z' as DatasetIsoTimestamp),
    ).rejects.toMatchObject({ code: 'DATASET_VERSION_NOT_FOUND' })
  })

  it('terminal state cannot reopen', async () => {
    const repo = makeInMemoryRepo()
    const svc = DatasetVersionService(repo)
    const v = makeVersion('ds-001', 'v1', 'REJECTED')
    await repo.save(v, { idempotencyKey: 'k3' })
    await expect(
      svc.transition('ds-001' as DatasetId, 'v1', 'VALIDATING', '2024-01-01T00:00:00.000Z' as DatasetIsoTimestamp),
    ).rejects.toMatchObject({ code: 'DATASET_VERSION_TERMINAL' })
  })
})

describe('DatasetVersionService.resolveLatestAdmitted', () => {
  it('returns latest admitted version by createdAt', async () => {
    const repo = makeInMemoryRepo()
    const svc = DatasetVersionService(repo)
    const v1: GovernedDatasetVersion = { ...makeVersion('ds-001', 'v1', 'ADMITTED'), createdAt: '2024-01-01T00:00:00.000Z' as DatasetIsoTimestamp }
    const v2: GovernedDatasetVersion = { ...makeVersion('ds-001', 'v2', 'ADMITTED'), createdAt: '2024-02-01T00:00:00.000Z' as DatasetIsoTimestamp }
    await repo.save(v1, { idempotencyKey: 'k4' })
    await repo.save(v2, { idempotencyKey: 'k5' })
    const result = await svc.resolveLatestAdmitted('ds-001' as DatasetId)
    expect(result?.resolution.resolvedVersion).toBe('v2')
  })

  it('returns undefined when no admitted version exists', async () => {
    const repo = makeInMemoryRepo()
    const svc = DatasetVersionService(repo)
    const v = makeVersion('ds-001', 'v1', 'DRAFT')
    await repo.save(v, { idempotencyKey: 'k6' })
    const result = await svc.resolveLatestAdmitted('ds-001' as DatasetId)
    expect(result).toBeUndefined()
  })

  it('RESTRICTED/DELETED versions are not returned as admitted', async () => {
    const repo = makeInMemoryRepo()
    const svc = DatasetVersionService(repo)
    const restricted = makeVersion('ds-001', 'v1', 'RESTRICTED')
    const deleted = makeVersion('ds-001', 'v2', 'DELETED')
    await repo.save(restricted, { idempotencyKey: 'k7' })
    await repo.save(deleted, { idempotencyKey: 'k8' })
    const result = await svc.resolveLatestAdmitted('ds-001' as DatasetId)
    expect(result).toBeUndefined()
  })
})

describe('DatasetVersionService.supersede', () => {
  it('supersession records old version and marks it SUPERSEDED', async () => {
    const repo = makeInMemoryRepo()
    const svc = DatasetVersionService(repo)
    const old = makeVersion('ds-001', 'v1', 'ADMITTED')
    const newV = makeVersion('ds-001', 'v2', 'ADMITTED')
    await repo.save(old, { idempotencyKey: 'k9' })
    await repo.save(newV, { idempotencyKey: 'k10' })
    const sup = await svc.supersede(
      'ds-001' as DatasetId, 'v1', 'v2',
      '2024-03-01T00:00:00.000Z' as DatasetIsoTimestamp,
      'new version available',
    )
    expect(sup.supersededVersion).toBe('v1')
    expect(sup.supersededByVersion).toBe('v2')
    const updated = await repo.findByIdAndVersion('ds-001' as DatasetId, 'v1')
    expect(updated?.state).toBe('SUPERSEDED')
  })

  it('superseding non-admitted version throws DATASET_VERSION_INVALID_TRANSITION', async () => {
    const repo = makeInMemoryRepo()
    const svc = DatasetVersionService(repo)
    const draft = makeVersion('ds-001', 'v1', 'DRAFT')
    await repo.save(draft, { idempotencyKey: 'k11' })
    await expect(
      svc.supersede('ds-001' as DatasetId, 'v1', 'v2', '2024-03-01T00:00:00.000Z' as DatasetIsoTimestamp, 'reason'),
    ).rejects.toMatchObject({ code: 'DATASET_VERSION_INVALID_TRANSITION' })
  })
})

describe('DatasetVersionService: deterministic ordering', () => {
  it('listVersions returns all versions regardless of state', async () => {
    const repo = makeInMemoryRepo()
    const svc = DatasetVersionService(repo)
    const v1 = makeVersion('ds-001', 'v1', 'ADMITTED')
    const v2 = makeVersion('ds-001', 'v2', 'DRAFT')
    await repo.save(v1, { idempotencyKey: 'k12' })
    await repo.save(v2, { idempotencyKey: 'k13' })
    const versions = await svc.listVersions('ds-001' as DatasetId)
    expect(versions.length).toBe(2)
  })
})
