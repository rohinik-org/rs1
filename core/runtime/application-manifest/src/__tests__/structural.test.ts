import { describe, it, expect } from 'vitest'
import { validateStructure } from '../structural.js'

const VALID_DOC: Record<string, unknown> = {
  schemaVersion: 'rohinik.application/v1',
  application: { id: 'com.example.app', name: 'App', version: '1.0.0' },
  runtime: { language: 'nodejs' },
  capabilities: { required: [], optional: [] },
  dependencyManagement: { mode: 'managed' },
  resolution: { allowMarketplace: true, allowExternalRegistries: false, allowLocalPackages: true },
  degradation: { allowOptionalCapabilityFailure: true },
}

it('valid document passes structural validation', () => {
  const result = validateStructure(VALID_DOC)
  expect(result.status).toBe('ok')
})

// T-9F-02
it('missing schemaVersion emits MISSING_SCHEMA_VERSION', () => {
  const { schemaVersion: _, ...doc } = VALID_DOC
  const result = validateStructure(doc)
  expect(result.status).toBe('error')
  if (result.status !== 'error') throw new Error('expected error')
  expect(result.diagnostics.some(d => d.code === 'MISSING_SCHEMA_VERSION')).toBe(true)
})

// T-9F-03
it('unsupported schemaVersion emits UNSUPPORTED_SCHEMA_VERSION', () => {
  const result = validateStructure({ ...VALID_DOC, schemaVersion: 'rohinik.application/v99' })
  expect(result.status).toBe('error')
  if (result.status !== 'error') throw new Error('expected error')
  expect(result.diagnostics.some(d => d.code === 'UNSUPPORTED_SCHEMA_VERSION')).toBe(true)
})

// Unknown top-level key
it('unknown top-level key emits UNKNOWN_TOP_LEVEL_KEY', () => {
  const result = validateStructure({ ...VALID_DOC, extraField: 'bad' })
  expect(result.status).toBe('error')
  if (result.status !== 'error') throw new Error('expected error')
  expect(result.diagnostics.some(d => d.code === 'UNKNOWN_TOP_LEVEL_KEY')).toBe(true)
})

// Unknown application key
it('unknown application key emits UNKNOWN_APPLICATION_KEY', () => {
  const result = validateStructure({
    ...VALID_DOC,
    application: { ...VALID_DOC['application'] as object, providerId: 'leaked' },
  })
  expect(result.status).toBe('error')
  if (result.status !== 'error') throw new Error('expected error')
  expect(result.diagnostics.some(d => d.code === 'UNKNOWN_APPLICATION_KEY')).toBe(true)
})

// T-9F-04
it('missing application.id emits MISSING_APPLICATION_ID', () => {
  const result = validateStructure({
    ...VALID_DOC,
    application: { name: 'App', version: '1.0.0' },
  })
  expect(result.status).toBe('error')
  if (result.status !== 'error') throw new Error('expected error')
  expect(result.diagnostics.some(d => d.code === 'MISSING_APPLICATION_ID')).toBe(true)
})

// T-9F-06
it('missing application.name emits MISSING_APPLICATION_NAME', () => {
  const result = validateStructure({
    ...VALID_DOC,
    application: { id: 'com.example.app', version: '1.0.0' },
  })
  expect(result.status).toBe('error')
  if (result.status !== 'error') throw new Error('expected error')
  expect(result.diagnostics.some(d => d.code === 'MISSING_APPLICATION_NAME')).toBe(true)
})

// T-9F-07
it('missing application.version emits MISSING_APPLICATION_VERSION', () => {
  const result = validateStructure({
    ...VALID_DOC,
    application: { id: 'com.example.app', name: 'App' },
  })
  expect(result.status).toBe('error')
  if (result.status !== 'error') throw new Error('expected error')
  expect(result.diagnostics.some(d => d.code === 'MISSING_APPLICATION_VERSION')).toBe(true)
})

// Unknown capability key
it('unknown capability key emits UNKNOWN_CAPABILITY_KEY', () => {
  const result = validateStructure({
    ...VALID_DOC,
    capabilities: {
      required: [{ id: 'ai:generate:text', version: '^1.0', secret: 'injected' }],
      optional: [],
    },
  })
  expect(result.status).toBe('error')
  if (result.status !== 'error') throw new Error('expected error')
  expect(result.diagnostics.some(d => d.code === 'UNKNOWN_CAPABILITY_KEY')).toBe(true)
})

// Unknown resolution key
it('unknown resolution key emits UNKNOWN_RESOLUTION_KEY', () => {
  const result = validateStructure({
    ...VALID_DOC,
    resolution: {
      ...(VALID_DOC['resolution'] as object),
      allowDarkMarketplace: true,
    },
  })
  expect(result.status).toBe('error')
  if (result.status !== 'error') throw new Error('expected error')
  expect(result.diagnostics.some(d => d.code === 'UNKNOWN_RESOLUTION_KEY')).toBe(true)
})
