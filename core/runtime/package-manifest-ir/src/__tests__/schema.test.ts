import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const schemaPath = resolve(__dirname, '../../schemas/rohinik.package.v1.schema.json')

const schema = JSON.parse(readFileSync(schemaPath, 'utf-8')) as Record<string, unknown>

describe('rohinik.package.v1.schema.json', () => {
  it('exists and parses as JSON', () => {
    expect(schema).toBeDefined()
  })

  it('has $schema field', () => {
    expect(typeof schema['$schema']).toBe('string')
    expect((schema['$schema'] as string).length).toBeGreaterThan(0)
  })

  it('has title set', () => {
    expect(typeof schema['title']).toBe('string')
    expect((schema['title'] as string).length).toBeGreaterThan(0)
  })

  it('required array contains schemaVersion and package', () => {
    const required = schema['required'] as string[]
    expect(Array.isArray(required)).toBe(true)
    expect(required).toContain('schemaVersion')
    expect(required).toContain('package')
  })

  it('package.required contains id, name, version, type', () => {
    const props = schema['properties'] as Record<string, unknown>
    const pkg = props['package'] as Record<string, unknown>
    const pkgRequired = pkg['required'] as string[]
    expect(pkgRequired).toContain('id')
    expect(pkgRequired).toContain('name')
    expect(pkgRequired).toContain('version')
    expect(pkgRequired).toContain('type')
  })

  it('type enum contains all 6 package types', () => {
    const props = schema['properties'] as Record<string, unknown>
    const pkg = props['package'] as Record<string, unknown>
    const pkgProps = pkg['properties'] as Record<string, unknown>
    const typeField = pkgProps['type'] as Record<string, unknown>
    const enumValues = typeField['enum'] as string[]
    expect(enumValues).toContain('capability-provider')
    expect(enumValues).toContain('capability-composite')
    expect(enumValues).toContain('adapter')
    expect(enumValues).toContain('infrastructure-provider')
    expect(enumValues).toContain('model-provider')
    expect(enumValues).toContain('developer-tooling')
    expect(enumValues).toHaveLength(6)
  })

  it('certification enum contains all 4 values', () => {
    const props = schema['properties'] as Record<string, unknown>
    const publisher = props['publisher'] as Record<string, unknown>
    const pubProps = publisher['properties'] as Record<string, unknown>
    const certField = pubProps['certification'] as Record<string, unknown>
    const enumValues = certField['enum'] as string[]
    expect(enumValues).toContain('official')
    expect(enumValues).toContain('verified')
    expect(enumValues).toContain('compatible')
    expect(enumValues).toContain('none')
    expect(enumValues).toHaveLength(4)
  })

  it('has additionalProperties: false at top level', () => {
    expect(schema['additionalProperties']).toBe(false)
  })
})
