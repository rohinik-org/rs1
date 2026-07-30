import { it, expect } from 'vitest'
import { decodePackageManifestYaml } from '../decoder.js'

it('decodes valid YAML into a plain object', () => {
  const result = decodePackageManifestYaml('schemaVersion: rohinik.package/v1\n')
  expect(result.status).toBe('ok')
})

it('returns error on oversized input', () => {
  const big = 'x: ' + 'a'.repeat(65 * 1024)
  const result = decodePackageManifestYaml(big)
  expect(result.status).toBe('error')
  if (result.status !== 'error') return
  expect(result.code).toBe('invalid-input')
  expect(result.message).toMatch(/exceeds maximum size/)
})

it('returns error on YAML parse error', () => {
  const result = decodePackageManifestYaml(': bad:\n  - [unclosed')
  expect(result.status).toBe('error')
  if (result.status !== 'error') return
  expect(result.code).toBe('invalid-input')
})

it('returns error when root is an array', () => {
  const result = decodePackageManifestYaml('- item1\n- item2\n')
  expect(result.status).toBe('error')
  if (result.status !== 'error') return
  expect(result.message).toMatch(/sequence/)
})

it('returns error when root is a scalar (empty string)', () => {
  const result = decodePackageManifestYaml('')
  expect(result.status).toBe('error')
})

it('does not coerce date strings (JSON_SCHEMA)', () => {
  const result = decodePackageManifestYaml('package:\n  version: 2024-01-01\n')
  expect(result.status).toBe('ok')
  if (result.status !== 'ok') return
  const pkg = (result.doc as Record<string, unknown>)['package'] as Record<string, unknown>
  expect(typeof pkg['version']).toBe('string')
})

it('rejects YAML with duplicate keys', () => {
  const result = decodePackageManifestYaml('a: 1\na: 2\n')
  expect(result.status).toBe('error')
})

it('rejects YAML alias expansion exceeding MAX_EXPANDED_BYTES', () => {
  const longValue = 'x'.repeat(1000)
  const refs = Array.from({ length: 300 }, (_, i) => `ref${i}: *anchor`).join('\n')
  const yaml = `anchor: &anchor "${longValue}"\n${refs}`
  const result = decodePackageManifestYaml(yaml)
  expect(result.status).toBe('error')
  if (result.status !== 'error') return
  expect(result.code).toBe('invalid-input')
  expect(result.message).toMatch(/expanded size/)
})
