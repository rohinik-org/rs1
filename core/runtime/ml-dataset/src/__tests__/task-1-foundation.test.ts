import { describe, it, expect } from 'vitest'
import * as MlDataset from '../../src/index.js'

// ── Dependency direction ───────────────────────────────────────────────────────

describe('dependency direction', () => {
  it('package.json has no forbidden dependencies', async () => {
    const pkg = await import('../../package.json', { assert: { type: 'json' } })
    const deps = Object.keys((pkg as { default: { dependencies?: Record<string, string> } }).default.dependencies ?? {})
    const forbidden = ['torch', 'tensorflow', 'onnxruntime', 'sklearn', 'mlflow', 'xgboost',
      'aws-sdk', '@aws-sdk', '@google-cloud', 'pg', 'mysql', 'mongodb', 'redis']
    for (const f of forbidden) {
      expect(deps.some(d => d.startsWith(f))).toBe(false)
    }
  })

  it('only allowed dependency is @rohinik-org/ml-ir', async () => {
    const pkg = await import('../../package.json', { assert: { type: 'json' } })
    const deps = Object.keys((pkg as { default: { dependencies?: Record<string, string> } }).default.dependencies ?? {})
    for (const d of deps) {
      expect(d).toBe('@rohinik-org/ml-ir')
    }
  })

  it('no ML framework name in dist/index.js', async () => {
    const { readFileSync } = await import('node:fs')
    const { fileURLToPath } = await import('node:url')
    const { dirname, resolve } = await import('node:path')
    const dir = dirname(fileURLToPath(import.meta.url))
    const dist = resolve(dir, '../../dist/index.js')
    const content = readFileSync(dist, 'utf-8')
    const forbidden = ['torch', 'tensorflow', 'onnxruntime', 'sklearn', 'mlflow', 'xgboost']
    for (const name of forbidden) {
      expect(content).not.toContain(name)
    }
  })

  it('no Date.now or Math.random in dist/index.js', async () => {
    const { readFileSync } = await import('node:fs')
    const { fileURLToPath } = await import('node:url')
    const { dirname, resolve } = await import('node:path')
    const dir = dirname(fileURLToPath(import.meta.url))
    const dist = resolve(dir, '../../dist/index.js')
    const content = readFileSync(dist, 'utf-8')
    expect(content).not.toContain('Date.now()')
    expect(content).not.toContain('Math.random()')
    expect(content).not.toContain('randomUUID()')
  })
})

// ── Export completeness ────────────────────────────────────────────────────────

describe('export completeness: governance context', () => {
  it('exports DatasetGovernanceContext type (structural)', () => {
    // DatasetGovernanceContext is a type — verified by usage in tests below
    const ctx: MlDataset.DatasetGovernanceContext = {
      tenantId: 'tenant-1',
      environmentId: 'env-prod',
      requestedAt: '2024-01-01T00:00:00.000Z' as MlDataset.DatasetIsoTimestamp,
      requestingPrincipalId: 'principal-1',
    }
    expect(ctx.tenantId).toBe('tenant-1')
  })
})

describe('export completeness: error codes', () => {
  it('exports DATASET_GOVERNANCE_ERROR_CODES (non-empty array)', () => {
    expect(MlDataset.DATASET_GOVERNANCE_ERROR_CODES).toBeDefined()
    expect(Array.isArray(MlDataset.DATASET_GOVERNANCE_ERROR_CODES)).toBe(true)
    expect((MlDataset.DATASET_GOVERNANCE_ERROR_CODES as readonly string[]).length).toBeGreaterThan(0)
  })

  it('all error codes are unique strings', () => {
    const codes = MlDataset.DATASET_GOVERNANCE_ERROR_CODES as readonly string[]
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('exports makeDatasetGovernanceError factory', () => {
    expect(MlDataset.makeDatasetGovernanceError).toBeDefined()
  })

  it('makeDatasetGovernanceError produces JSON-safe object', () => {
    const e = MlDataset.makeDatasetGovernanceError('DATASET_MANIFEST_INVALID', 'bad manifest')
    expect(e.code).toBe('DATASET_MANIFEST_INVALID')
    expect(e.message).toBe('bad manifest')
    expect(JSON.parse(JSON.stringify(e))).toEqual(e)
    expect(Object.keys(e)).not.toContain('stack')
  })

  it('makeDatasetGovernanceError accepts optional details', () => {
    const e = MlDataset.makeDatasetGovernanceError('DATASET_AUTHORIZATION_DENIED', 'no auth', { datasetId: 'ds-1' })
    expect(e.details).toEqual({ datasetId: 'ds-1' })
  })
})

describe('export completeness: repository interfaces exist as structural types', () => {
  it('DatasetManifestRepository shape is usable', () => {
    const repo: MlDataset.DatasetManifestRepository = {
      save: async (_m, _opts) => ({ stored: true, conflict: false }),
      findById: async (_id) => undefined,
    }
    expect(typeof repo.save).toBe('function')
    expect(typeof repo.findById).toBe('function')
  })

  it('DatasetVersionRepository shape is usable', () => {
    const repo: MlDataset.DatasetVersionRepository = {
      save: async (_v, _opts) => ({ stored: true, conflict: false }),
      findByIdAndVersion: async (_id, _v) => undefined,
      listVersions: async (_id) => [],
    }
    expect(typeof repo.save).toBe('function')
  })

  it('FeatureSchemaRepository shape is usable', () => {
    const repo: MlDataset.FeatureSchemaRepository = {
      save: async (_s, _opts) => ({ stored: true, conflict: false }),
      findById: async (_id) => undefined,
      listVersions: async (_id) => [],
    }
    expect(typeof repo.save).toBe('function')
  })

  it('DatasetLineageRepository shape is usable', () => {
    const repo: MlDataset.DatasetLineageRepository = {
      saveNode: async (_n, _opts) => ({ stored: true, conflict: false }),
      findNode: async (_id) => undefined,
      findAncestors: async (_id) => [],
      findDescendants: async (_id) => [],
    }
    expect(typeof repo.saveNode).toBe('function')
  })

  it('DatasetAuthorizationRepository shape is usable', () => {
    const repo: MlDataset.DatasetAuthorizationRepository = {
      save: async (_a, _opts) => ({ stored: true, conflict: false }),
      findCurrent: async (_id, _purpose, _scope) => undefined,
      listForDataset: async (_id) => [],
    }
    expect(typeof repo.save).toBe('function')
  })

  it('LeakageRepository shape is usable', () => {
    const repo: MlDataset.LeakageRepository = {
      save: async (_r, _opts) => ({ stored: true, conflict: false }),
      findByDatasetId: async (_id) => undefined,
    }
    expect(typeof repo.save).toBe('function')
  })

  it('DeletionImpactRepository shape is usable', () => {
    const repo: MlDataset.DeletionImpactRepository = {
      save: async (_r, _opts) => ({ stored: true, conflict: false }),
      findByDatasetId: async (_id) => undefined,
    }
    expect(typeof repo.save).toBe('function')
  })
})

// ── Write semantics ────────────────────────────────────────────────────────────

describe('idempotent vs conflicting write semantics', () => {
  it('RepositoryWriteResult has stored and conflict fields', () => {
    const ok: MlDataset.RepositoryWriteResult = { stored: true, conflict: false }
    const conflict: MlDataset.RepositoryWriteResult = { stored: false, conflict: true }
    expect(ok.stored).toBe(true)
    expect(conflict.conflict).toBe(true)
  })

  it('RepositoryWriteOptions has expectedRevision optional field', () => {
    const opts: MlDataset.RepositoryWriteOptions = { idempotencyKey: 'key-1', expectedRevision: 1 }
    expect(opts.expectedRevision).toBe(1)
    const optsNoRev: MlDataset.RepositoryWriteOptions = { idempotencyKey: 'key-2' }
    expect(optsNoRev.expectedRevision).toBeUndefined()
  })
})

// ── No class declarations ──────────────────────────────────────────────────────

describe('no implementation classes exported', () => {
  it('dist/index.js contains no class declarations', async () => {
    const { readFileSync } = await import('node:fs')
    const { fileURLToPath } = await import('node:url')
    const { dirname, resolve } = await import('node:path')
    const dir = dirname(fileURLToPath(import.meta.url))
    const dist = resolve(dir, '../../dist/index.js')
    const content = readFileSync(dist, 'utf-8')
    expect(content).not.toMatch(/\bclass\s+\w/)
  })
})

// ── No as any ─────────────────────────────────────────────────────────────────

describe('release gate: no as any', () => {
  it('src/index.ts contains no "as any"', async () => {
    const { readFileSync } = await import('node:fs')
    const { fileURLToPath } = await import('node:url')
    const { dirname, resolve } = await import('node:path')
    const dir = dirname(fileURLToPath(import.meta.url))
    const src = resolve(dir, '../index.ts')
    const content = readFileSync(src, 'utf-8')
    expect(content).not.toContain('as any')
  })
})
