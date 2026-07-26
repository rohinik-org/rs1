import { describe, it, expect } from 'vitest'
import { decodeManifestYaml } from '../decoder.js'

it('decodes valid YAML into a plain object', () => {
  const result = decodeManifestYaml('schemaVersion: rohinik.application/v1\n')
  expect(result.status).toBe('ok')
})

it('returns error on malformed YAML', () => {
  const result = decodeManifestYaml(': bad:\n  - [unclosed')
  expect(result.status).toBe('error')
  expect(result.diagnostic.code).toBe('YAML_PARSE_ERROR')
})

it('returns error when root is not a mapping', () => {
  const result = decodeManifestYaml('- item1\n- item2\n')
  expect(result.status).toBe('error')
  expect(result.diagnostic.code).toBe('INVALID_ROOT_TYPE')
})

it('returns error when root is a scalar', () => {
  const result = decodeManifestYaml('just a string\n')
  expect(result.status).toBe('error')
  expect(result.diagnostic.code).toBe('INVALID_ROOT_TYPE')
})

it('does not evaluate JS types (date coercion)', () => {
  // js-yaml by default coerces "2024-01-01" to a Date — decoder must use JSON_SCHEMA
  const result = decodeManifestYaml('application:\n  version: 2024-01-01\n')
  expect(result.status).toBe('ok')
  if (result.status !== 'ok') return
  const appBlock = (result.doc as Record<string, unknown>)['application'] as Record<string, unknown>
  // Must remain a string, not a Date object
  expect(typeof appBlock['version']).toBe('string')
})
