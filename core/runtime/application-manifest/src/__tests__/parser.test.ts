import { describe, it, expect } from 'vitest'
import { createManifestParser } from '../parser.js'

const VALID_YAML = `
schemaVersion: rohinik.application/v1
application:
  id: com.example.app
  name: App
  version: 1.0.0
runtime:
  language: nodejs
capabilities:
  required:
    - id: ai:generate:text
      version: "^1.0"
      constraints:
        execution: local-preferred
  optional: []
dependencyManagement:
  mode: managed
resolution:
  allowMarketplace: true
  allowExternalRegistries: false
  allowLocalPackages: true
degradation:
  allowOptionalCapabilityFailure: true
`

const parser = createManifestParser()

// T-9F-01
it('valid manifest parses to status=valid (T-9F-01)', () => {
  const result = parser.parse(VALID_YAML)
  expect(result.status).toBe('valid')
  if (result.status !== 'valid') return
  expect(result.manifest.application.id).toBe('com.example.app')
  expect(result.manifest.capabilities.required).toHaveLength(1)
})

// T-9F-28/L-9F-004 — same content twice = same semanticHash
it('parsing same YAML twice produces identical semanticHash (T-9F-28, L-9F-004)', () => {
  const r1 = parser.parse(VALID_YAML)
  const r2 = parser.parse(VALID_YAML)
  if (r1.status !== 'valid' || r2.status !== 'valid') return
  expect(r1.manifest.semanticHash).toBe(r2.manifest.semanticHash)
})

// L-9F-004 — comments do not change semanticHash
it('YAML comments do not change semanticHash (L-9F-004)', () => {
  const withComment = VALID_YAML.trimEnd() + '\n# trailing comment\n'
  const r1 = parser.parse(VALID_YAML)
  const r2 = parser.parse(withComment)
  if (r1.status !== 'valid' || r2.status !== 'valid') return
  expect(r1.manifest.semanticHash).toBe(r2.manifest.semanticHash)
})

// sourceHash differs for different source bytes
it('different source bytes produce different sourceHash', () => {
  const r1 = parser.parse(VALID_YAML)
  const different = VALID_YAML.replace('App', 'App2')
  const r2 = parser.parse(different)
  if (r1.status !== 'valid' || r2.status !== 'valid') return
  expect(r1.manifest.sourceHash).not.toBe(r2.manifest.sourceHash)
})

// different declarations change semanticHash
it('different capability declarations change semanticHash (T-9F-29)', () => {
  const withExtra = VALID_YAML.replace('optional: []', `optional:\n    - id: ai:rerank\n      version: "^1.0"`)
  const r1 = parser.parse(VALID_YAML)
  const r2 = parser.parse(withExtra)
  if (r1.status !== 'valid' || r2.status !== 'valid') return
  expect(r1.manifest.semanticHash).not.toBe(r2.manifest.semanticHash)
})

// invalid structural errors stop later phases
it('structural error stops constraint compilation phase', () => {
  const result = parser.parse('schemaVersion: rohinik.application/v1\n')
  expect(result.status).toBe('invalid')
  expect(result.diagnostics.some(d => d.severity === 'error')).toBe(true)
})

// optional capability with multiplicity and constraints survives parse
it('optional capability preserves multiplicity and constraints', () => {
  const withOpt = VALID_YAML.replace('optional: []', `optional:\n    - id: ai:rerank\n      version: "^1.0"\n      multiplicity: one-or-more\n      constraints:\n        maximumLatencyMs: 200`)
  const result = parser.parse(withOpt)
  expect(result.status).toBe('valid')
  if (result.status !== 'valid') return
  const opt = result.manifest.capabilities.optional[0]
  expect(opt?.multiplicity).toBe('one-or-more')
  expect(opt?.constraints).toHaveLength(1)
})
