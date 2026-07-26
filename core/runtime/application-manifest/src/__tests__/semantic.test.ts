import { describe, it, expect } from 'vitest'
import { validateSemantics } from '../semantic.js'
import type { SourceDoc } from '../structural.js'

function makeDoc(overrides: Partial<SourceDoc> = {}): SourceDoc {
  return {
    schemaVersion: 'rohinik.application/v1',
    application: { id: 'com.example.app', name: 'App', version: '1.0.0' },
    runtime: { language: 'nodejs' },
    capabilitiesRequired: [],
    capabilitiesOptional: [],
    dependencyManagementMode: 'managed',
    resolution: { allowMarketplace: true, allowExternalRegistries: false, allowLocalPackages: true },
    degradation: { allowOptionalCapabilityFailure: true },
    ...overrides,
  }
}

// T-9F-05 — reverse-domain application ID
it('application.id must be reverse-domain format', () => {
  const result = validateSemantics(makeDoc({ application: { id: 'UPPERCASE_INVALID', name: 'App', version: '1.0.0' } }))
  expect(result.some(d => d.code === 'INVALID_APPLICATION_ID')).toBe(true)
})

it('application.id single-segment is rejected', () => {
  const result = validateSemantics(makeDoc({ application: { id: 'myapp', name: 'App', version: '1.0.0' } }))
  expect(result.some(d => d.code === 'INVALID_APPLICATION_ID')).toBe(true)
})

it('application.id valid reverse-domain passes', () => {
  const result = validateSemantics(makeDoc())
  expect(result.filter(d => d.code === 'INVALID_APPLICATION_ID')).toHaveLength(0)
})

// T-9F-08 — application.version semver
it('application.version must be valid semver', () => {
  const result = validateSemantics(makeDoc({ application: { id: 'com.example.app', name: 'App', version: 'not-semver' } }))
  expect(result.some(d => d.code === 'INVALID_APPLICATION_VERSION')).toBe(true)
})

// T-9F-11 — capability ID pattern
it('capability ID must match CAPABILITY_ID_PATTERN', () => {
  const result = validateSemantics(makeDoc({
    capabilitiesRequired: [{ id: 'INVALID ID', version: '^1.0' }],
  }))
  expect(result.some(d => d.code === 'INVALID_CAPABILITY_ID')).toBe(true)
})

// T-9F-12 — version range
it('capability version range must be valid semver range', () => {
  const result = validateSemantics(makeDoc({
    capabilitiesRequired: [{ id: 'ai:generate:text', version: 'not a range' }],
  }))
  expect(result.some(d => d.code === 'INVALID_VERSION_RANGE')).toBe(true)
})

// T-9F-19 — multiplicity
it('invalid multiplicity is rejected', () => {
  const result = validateSemantics(makeDoc({
    capabilitiesRequired: [{ id: 'ai:generate:text', version: '^1.0', multiplicity: 'bad-value' }],
  }))
  expect(result.some(d => d.code === 'INVALID_MULTIPLICITY')).toBe(true)
})

// T-9F-13 — intra-list duplicate
it('duplicate capability within required list is rejected', () => {
  const result = validateSemantics(makeDoc({
    capabilitiesRequired: [
      { id: 'ai:generate:text', version: '^1.0' },
      { id: 'ai:generate:text', version: '^1.0' },
    ],
  }))
  expect(result.some(d => d.code === 'DUPLICATE_CAPABILITY_ID')).toBe(true)
})

// Cross-list duplicate (same cap in required AND optional)
it('capability in both required and optional is rejected', () => {
  const result = validateSemantics(makeDoc({
    capabilitiesRequired: [{ id: 'ai:generate:text', version: '^1.0' }],
    capabilitiesOptional: [{ id: 'ai:generate:text', version: '^1.0' }],
  }))
  expect(result.some(d => d.code === 'DUPLICATE_CAPABILITY_ID')).toBe(true)
})

it('no errors for valid doc with mixed capabilities', () => {
  const result = validateSemantics(makeDoc({
    capabilitiesRequired: [{ id: 'ai:generate:text', version: '^1.0' }],
    capabilitiesOptional: [{ id: 'ai:rerank', version: '^1.0' }],
  }))
  expect(result.filter(d => d.severity === 'error')).toHaveLength(0)
})
