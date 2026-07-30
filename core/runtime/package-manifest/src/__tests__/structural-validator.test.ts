import { describe, it, expect } from 'vitest'
import { validateStructure } from '../structural-validator.js'

const MIN_VALID: Record<string, unknown> = {
  schemaVersion: 'rohinik.package/v1',
  package: { id: 'com.example.my-package', name: 'My Package', version: '1.0.0', type: 'capability-provider' },
}

it('valid minimal doc returns valid', () => {
  const r = validateStructure(MIN_VALID)
  expect(r.valid).toBe(true)
})

it('missing schemaVersion → unsupported-schema', () => {
  const doc = { package: MIN_VALID['package'] }
  const r = validateStructure(doc)
  expect(r.valid).toBe(false)
  if (r.valid) return
  expect(r.issues.some(i => i.code === 'unsupported-schema')).toBe(true)
})

it('wrong schemaVersion → unsupported-schema', () => {
  const doc = { ...MIN_VALID, schemaVersion: 'rohinik.package/v2' }
  const r = validateStructure(doc)
  expect(r.valid).toBe(false)
  if (r.valid) return
  expect(r.issues.some(i => i.code === 'unsupported-schema')).toBe(true)
})

it('missing package section → invalid-input', () => {
  const doc = { schemaVersion: 'rohinik.package/v1' }
  const r = validateStructure(doc)
  expect(r.valid).toBe(false)
  if (r.valid) return
  expect(r.issues.some(i => i.code === 'invalid-input')).toBe(true)
})

it('missing package.id → invalid-input', () => {
  const doc = { ...MIN_VALID, package: { name: 'x', version: '1.0.0', type: 'adapter' } }
  const r = validateStructure(doc)
  expect(r.valid).toBe(false)
  if (r.valid) return
  expect(r.issues.some(i => i.path?.includes('id'))).toBe(true)
})

it('unknown top-level key → validation-failed', () => {
  const doc = { ...MIN_VALID, unknownField: 'oops' }
  const r = validateStructure(doc)
  expect(r.valid).toBe(false)
  if (r.valid) return
  expect(r.issues.some(i => i.code === 'validation-failed' && i.message.includes('unknownField'))).toBe(true)
})

it('provides as non-array → invalid-input', () => {
  const doc = { ...MIN_VALID, provides: 'not-an-array' }
  const r = validateStructure(doc)
  expect(r.valid).toBe(false)
})

it('publisher without id → invalid-input', () => {
  const doc = { ...MIN_VALID, publisher: { certification: 'none' } }
  const r = validateStructure(doc)
  expect(r.valid).toBe(false)
  if (r.valid) return
  expect(r.issues.some(i => i.path === 'publisher.id')).toBe(true)
})
