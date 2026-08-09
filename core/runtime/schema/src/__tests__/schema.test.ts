import { describe, it, expect } from 'vitest'
import { defineJsonSchema, SchemaHashMismatchError } from '../index.js'

const personSchema = {
  type: 'object',
  properties: { name: { type: 'string' }, age: { type: 'number' } },
  required: ['name'],
} as const

describe('defineJsonSchema', () => {
  it('returns BoundSchema with schemaId and version', () => {
    const s = defineJsonSchema('person', '1', personSchema)
    expect(s.schemaId).toBe('person')
    expect(s.version).toBe('1')
  })

  it('semanticHash is a 64-char hex string', () => {
    const s = defineJsonSchema('person', '1', personSchema)
    expect(s.semanticHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('semanticHash is stable across calls with same schema', () => {
    const a = defineJsonSchema('x', '1', personSchema)
    const b = defineJsonSchema('x', '1', personSchema)
    expect(a.semanticHash).toBe(b.semanticHash)
  })

  it('semanticHash differs for different schemas', () => {
    const a = defineJsonSchema('x', '1', { type: 'string' } as const)
    const b = defineJsonSchema('x', '1', { type: 'number' } as const)
    expect(a.semanticHash).not.toBe(b.semanticHash)
  })

  it('semanticHash is key-order-independent (canonical JSON)', () => {
    const a = defineJsonSchema('x', '1', { type: 'object', required: ['name'], properties: { name: { type: 'string' } } } as const)
    const b = defineJsonSchema('x', '1', { properties: { name: { type: 'string' } }, required: ['name'], type: 'object' } as const)
    expect(a.semanticHash).toBe(b.semanticHash)
  })

  it('ref() returns OutputSchemaRef with all three fields', () => {
    const s = defineJsonSchema('person', '1', personSchema)
    const ref = s.ref()
    expect(ref.schemaId).toBe('person')
    expect(ref.version).toBe('1')
    expect(ref.semanticHash).toBe(s.semanticHash)
  })
})

describe('validateLocal', () => {
  it('returns valid:true for conforming value', () => {
    const s = defineJsonSchema('person', '1', personSchema)
    const result = s.validateLocal({ name: 'Alice', age: 30 })
    expect(result.valid).toBe(true)
    expect(result.errors).toBeUndefined()
  })

  it('returns valid:false with errors for non-conforming value', () => {
    const s = defineJsonSchema('person', '1', personSchema)
    const result = s.validateLocal({ age: 42 })
    expect(result.valid).toBe(false)
    expect(result.errors).toBeDefined()
    expect(result.errors!.length).toBeGreaterThan(0)
  })

  it('does not throw for null input', () => {
    const s = defineJsonSchema('maybe-null', '1', { type: 'null' } as const)
    const result = s.validateLocal(null)
    expect(result.valid).toBe(true)
  })
})

describe('SchemaHashMismatchError', () => {
  it('is throwable and has correct name', () => {
    const err = new SchemaHashMismatchError('abc', 'def')
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('SchemaHashMismatchError')
    expect(err.expected).toBe('abc')
    expect(err.received).toBe('def')
  })
})
