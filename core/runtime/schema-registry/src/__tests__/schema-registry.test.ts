import { describe, it, expect } from 'vitest'
import {
  computeSchemaHash,
  InMemorySchemaRegistry,
  SchemaRegistryError,
} from '../index.js'

const PERSON_SCHEMA = {
  $schema: 'https://json-schema.org/draft-07/schema',
  type: 'object',
  required: ['name', 'age'],
  additionalProperties: false,
  properties: {
    name: { type: 'string' },
    age:  { type: 'integer', minimum: 0 },
  },
} as const

const SCHEMA_REF = { schemaId: 'person', version: '1.0', semanticHash: '' }

describe('computeSchemaHash', () => {
  it('returns a 64-char hex string', () => {
    const h = computeSchemaHash(PERSON_SCHEMA as Record<string, unknown>)
    expect(h).toHaveLength(64)
    expect(h).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is deterministic — same schema same hash', () => {
    const h1 = computeSchemaHash(PERSON_SCHEMA as Record<string, unknown>)
    const h2 = computeSchemaHash(PERSON_SCHEMA as Record<string, unknown>)
    expect(h1).toBe(h2)
  })

  it('is key-order independent — same logical schema same hash', () => {
    const a = computeSchemaHash({ b: 1, a: 2 })
    const b = computeSchemaHash({ a: 2, b: 1 })
    expect(a).toBe(b)
  })

  it('differs for distinct schemas', () => {
    const h1 = computeSchemaHash({ type: 'string' })
    const h2 = computeSchemaHash({ type: 'integer' })
    expect(h1).not.toBe(h2)
  })
})

describe('InMemorySchemaRegistry.register', () => {
  it('returns SchemaRecord with correct fields', async () => {
    const reg = new InMemorySchemaRegistry()
    const record = await reg.register({ schemaId: 'person', version: '1.0', schema: PERSON_SCHEMA as Record<string, unknown> })
    expect(record.schemaId).toBe('person')
    expect(record.version).toBe('1.0')
    expect(record.semanticHash).toHaveLength(64)
    expect(typeof record.registeredAt).toBe('string')
    expect(record.schema).toEqual(PERSON_SCHEMA)
  })

  it('stored hash matches computeSchemaHash', async () => {
    const reg = new InMemorySchemaRegistry()
    const record = await reg.register({ schemaId: 'x', version: '1', schema: PERSON_SCHEMA as Record<string, unknown> })
    expect(record.semanticHash).toBe(computeSchemaHash(PERSON_SCHEMA as Record<string, unknown>))
  })

  it('throws SCHEMA_ALREADY_EXISTS on duplicate schemaId+version', async () => {
    const reg = new InMemorySchemaRegistry()
    await reg.register({ schemaId: 'dupe', version: '1.0', schema: { type: 'string' } })
    const err = await reg.register({ schemaId: 'dupe', version: '1.0', schema: { type: 'string' } })
      .catch(e => e)
    expect(err).toBeInstanceOf(SchemaRegistryError)
    expect((err as SchemaRegistryError).code).toBe('SCHEMA_ALREADY_EXISTS')
  })

  it('same schemaId different version both register', async () => {
    const reg = new InMemorySchemaRegistry()
    await reg.register({ schemaId: 'versioned', version: '1.0', schema: { type: 'string' } })
    await expect(
      reg.register({ schemaId: 'versioned', version: '2.0', schema: { type: 'integer' } })
    ).resolves.toMatchObject({ schemaId: 'versioned', version: '2.0' })
  })
})

describe('InMemorySchemaRegistry.get', () => {
  it('returns registered record', async () => {
    const reg = new InMemorySchemaRegistry()
    await reg.register({ schemaId: 'p', version: '1', schema: PERSON_SCHEMA as Record<string, unknown> })
    const got = await reg.get('p', '1')
    expect(got.schemaId).toBe('p')
    expect(got.version).toBe('1')
  })

  it('throws SCHEMA_NOT_FOUND for unknown id', async () => {
    const reg = new InMemorySchemaRegistry()
    const err = await reg.get('nope', '1').catch(e => e)
    expect(err).toBeInstanceOf(SchemaRegistryError)
    expect((err as SchemaRegistryError).code).toBe('SCHEMA_NOT_FOUND')
  })
})

describe('InMemorySchemaRegistry.has', () => {
  it('returns true for registered, false for missing', async () => {
    const reg = new InMemorySchemaRegistry()
    await reg.register({ schemaId: 'h', version: '1', schema: { type: 'string' } })
    expect(await reg.has('h', '1')).toBe(true)
    expect(await reg.has('h', '2')).toBe(false)
  })
})

describe('InMemorySchemaRegistry.validate', () => {
  it('VALID for conforming value', async () => {
    const reg = new InMemorySchemaRegistry()
    const record = await reg.register({ schemaId: 'person', version: '1', schema: PERSON_SCHEMA as Record<string, unknown> })
    const ref = { schemaId: 'person', version: '1', semanticHash: record.semanticHash }
    const result = await reg.validate(ref, { name: 'Alice', age: 30 })
    expect(result.outcome).toBe('VALID')
    expect(result.errorCount).toBe(0)
    expect(result.errors).toHaveLength(0)
  })

  it('INVALID for non-conforming value with errors', async () => {
    const reg = new InMemorySchemaRegistry()
    const record = await reg.register({ schemaId: 'person', version: '1', schema: PERSON_SCHEMA as Record<string, unknown> })
    const ref = { schemaId: 'person', version: '1', semanticHash: record.semanticHash }
    // missing required 'age', extra property
    const result = await reg.validate(ref, { name: 'Bob', extra: true })
    expect(result.outcome).toBe('INVALID')
    expect(result.errorCount).toBeGreaterThan(0)
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('INVALID carries error strings', async () => {
    const reg = new InMemorySchemaRegistry()
    const record = await reg.register({ schemaId: 'num', version: '1', schema: { type: 'number' } })
    const ref = { schemaId: 'num', version: '1', semanticHash: record.semanticHash }
    const result = await reg.validate(ref, 'not-a-number')
    expect(result.outcome).toBe('INVALID')
    expect(result.errors[0]).toContain('number')
  })

  it('throws SCHEMA_NOT_FOUND when ref points to unregistered schema', async () => {
    const reg = new InMemorySchemaRegistry()
    const err = await reg.validate({ schemaId: 'ghost', version: '1', semanticHash: 'a'.repeat(64) }, {})
      .catch(e => e)
    expect(err).toBeInstanceOf(SchemaRegistryError)
    expect((err as SchemaRegistryError).code).toBe('SCHEMA_NOT_FOUND')
  })

  it('throws SCHEMA_HASH_MISMATCH when ref hash differs from stored hash', async () => {
    const reg = new InMemorySchemaRegistry()
    await reg.register({ schemaId: 'strict', version: '1', schema: { type: 'string' } })
    const wrongRef = { schemaId: 'strict', version: '1', semanticHash: 'b'.repeat(64) }
    const err = await reg.validate(wrongRef, 'hello').catch(e => e)
    expect(err).toBeInstanceOf(SchemaRegistryError)
    expect((err as SchemaRegistryError).code).toBe('SCHEMA_HASH_MISMATCH')
  })

  it('result carries schemaId, version, semanticHash', async () => {
    const reg = new InMemorySchemaRegistry()
    const record = await reg.register({ schemaId: 'q', version: '2', schema: { type: 'boolean' } })
    const ref = { schemaId: 'q', version: '2', semanticHash: record.semanticHash }
    const result = await reg.validate(ref, true)
    expect(result.schemaId).toBe('q')
    expect(result.version).toBe('2')
    expect(result.semanticHash).toBe(record.semanticHash)
  })

  it('validate is idempotent — same result on repeated calls', async () => {
    const reg = new InMemorySchemaRegistry()
    const record = await reg.register({ schemaId: 'idem', version: '1', schema: { type: 'string' } })
    const ref = { schemaId: 'idem', version: '1', semanticHash: record.semanticHash }
    const r1 = await reg.validate(ref, 'hello')
    const r2 = await reg.validate(ref, 'hello')
    expect(r1.outcome).toBe(r2.outcome)
    expect(r1.errorCount).toBe(r2.errorCount)
  })
})
