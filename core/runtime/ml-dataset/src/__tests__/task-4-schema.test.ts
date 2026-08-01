// Task 4 — Feature schema registry and compatibility tests
import { describe, it, expect } from 'vitest'
import {
  validateFeatureSchema,
  assessSchemaCompatibility,
  makeDatasetGovernanceError,
  DATASET_GOVERNANCE_ERROR_CODES,
} from '../index.js'
import type {
  GovernedFeatureSchema,
  FeatureSchemaRegistry,
  FeatureSchemaCompatibilityResult,
} from '../index.js'
import type { FeatureSchemaId, ContentHash, IsoTimestamp } from '@rohinik-org/ml-ir'

// ── helpers ───────────────────────────────────────────────────────────────────

function fid(v: string): FeatureSchemaId { return v as FeatureSchemaId }
function ch(v: string): ContentHash { return `sha256:${'a'.repeat(64)}` as ContentHash }
const TS = '2026-08-01T00:00:00.000Z' as IsoTimestamp

function base(): GovernedFeatureSchema {
  return {
    featureSchemaId: fid('schema-1'),
    name: 'test-schema',
    features: [
      { name: 'age', dtype: 'int32', nullable: false },
      { name: 'income', dtype: 'float32', nullable: true },
    ],
    targets: [{ name: 'label', dtype: 'int32' }],
    contentHash: ch('base'),
    createdAt: TS,
  }
}

// ── validateFeatureSchema ─────────────────────────────────────────────────────

describe('validateFeatureSchema', () => {
  it('valid schema registers successfully', () => {
    expect(() => validateFeatureSchema(base())).not.toThrow()
  })

  it('schema with duplicate feature names throws FEATURE_SCHEMA_DUPLICATE_NAME', () => {
    const schema = { ...base(), features: [
      { name: 'age', dtype: 'int32' },
      { name: 'age', dtype: 'float32' },
    ]}
    expect(() => validateFeatureSchema(schema)).toThrow()
    try { validateFeatureSchema(schema) } catch (e: unknown) {
      expect((e as { code?: string }).code).toBe('FEATURE_SCHEMA_DUPLICATE_NAME')
    }
  })

  it('schema with no targets throws FEATURE_SCHEMA_INVALID_TARGET', () => {
    const schema = { ...base(), targets: [] }
    expect(() => validateFeatureSchema(schema)).toThrow()
    try { validateFeatureSchema(schema) } catch (e: unknown) {
      expect((e as { code?: string }).code).toBe('FEATURE_SCHEMA_INVALID_TARGET')
    }
  })
})

// ── assessSchemaCompatibility ─────────────────────────────────────────────────

describe('assessSchemaCompatibility', () => {
  it('identical schemas produce EXACT compatibility', () => {
    const result = assessSchemaCompatibility(base(), base())
    expect(result.outcome).toBe('EXACT')
  })

  it('adding optional (nullable) feature → BACKWARD_COMPATIBLE', () => {
    const candidate = { ...base(), features: [
      ...base().features,
      { name: 'score', dtype: 'float32', nullable: true },
    ]}
    expect(assessSchemaCompatibility(base(), candidate).outcome).toBe('BACKWARD_COMPATIBLE')
  })

  it('adding required (non-nullable) feature → INCOMPATIBLE', () => {
    const candidate = { ...base(), features: [
      ...base().features,
      { name: 'score', dtype: 'float32', nullable: false },
    ]}
    expect(assessSchemaCompatibility(base(), candidate).outcome).toBe('INCOMPATIBLE')
  })

  it('removing optional feature → FORWARD_COMPATIBLE', () => {
    const candidate = { ...base(), features: [
      { name: 'age', dtype: 'int32', nullable: false },
      // income (nullable=true) removed
    ]}
    expect(assessSchemaCompatibility(base(), candidate).outcome).toBe('FORWARD_COMPATIBLE')
  })

  it('changing feature dtype → INCOMPATIBLE', () => {
    const candidate = { ...base(), features: [
      { name: 'age', dtype: 'float64', nullable: false }, // dtype changed
      { name: 'income', dtype: 'float32', nullable: true },
    ]}
    expect(assessSchemaCompatibility(base(), candidate).outcome).toBe('INCOMPATIBLE')
  })

  it('sensitive-role feature removed → REQUIRES_REVIEW', () => {
    const baseline: GovernedFeatureSchema = { ...base(), features: [
      { name: 'age', dtype: 'int32', nullable: false },
      { name: 'ssn', dtype: 'string', nullable: false, role: 'SENSITIVE' },
    ]}
    const candidate: GovernedFeatureSchema = { ...base(), features: [
      { name: 'age', dtype: 'int32', nullable: false },
      // ssn (SENSITIVE) removed
    ]}
    expect(assessSchemaCompatibility(baseline, candidate).outcome).toBe('REQUIRES_REVIEW')
  })

  it('target type change → INCOMPATIBLE', () => {
    const candidate = { ...base(), targets: [{ name: 'label', dtype: 'float32' }] }
    expect(assessSchemaCompatibility(base(), candidate).outcome).toBe('INCOMPATIBLE')
  })

  it('compatibility result is deterministic', () => {
    const r1 = assessSchemaCompatibility(base(), base())
    const r2 = assessSchemaCompatibility(base(), base())
    expect(r1.outcome).toBe(r2.outcome)
    expect(r1.reasons).toEqual(r2.reasons)
  })
})

// ── FeatureSchemaRegistry (in-memory stub satisfies interface) ────────────────

describe('FeatureSchemaRegistry', () => {
  it('supersession: second schema version replaces first', async () => {
    const store = new Map<string, GovernedFeatureSchema[]>()

    // ponytail: inline stub — no class, satisfies FeatureSchemaRegistry structurally
    const registry: FeatureSchemaRegistry = {
      async register(schema, opts) {
        const list = store.get(schema.featureSchemaId) ?? []
        list.push(schema)
        store.set(schema.featureSchemaId, list)
        return { stored: true, conflict: false }
      },
      async findById(id) {
        const list = store.get(id)
        return list ? list[list.length - 1] : undefined
      },
      async listVersions(id) {
        return store.get(id) ?? []
      },
      async supersede(oldId, newSchema, opts) {
        const list = store.get(oldId) ?? []
        list.push(newSchema)
        store.set(oldId, list)
        return { stored: true, conflict: false }
      },
    }

    const v1 = base()
    await registry.register(v1, { idempotencyKey: 'k1' })
    const v2: GovernedFeatureSchema = { ...base(), name: 'test-schema-v2' }
    await registry.supersede(fid('schema-1'), v2, { idempotencyKey: 'k2' })

    const versions = await registry.listVersions(fid('schema-1'))
    expect(versions).toHaveLength(2)
    const current = await registry.findById(fid('schema-1'))
    expect(current?.name).toBe('test-schema-v2')
  })
})
