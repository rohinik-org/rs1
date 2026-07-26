import { describe, it, expect } from 'vitest'
import { createManifestParser } from '../parser.js'
import { createManifestCompiler } from '../compiler.js'
import {
  createCapabilityRequirementBuilder,
  createProductionIdGenerator,
  createProductionClock,
} from '@rohinik-org/capability-contracts'

const parser = createManifestParser()
const compiler = createManifestCompiler({
  requirementBuilder: createCapabilityRequirementBuilder({
    idGenerator: createProductionIdGenerator(),
    clock: createProductionClock(),
  }),
})

const VALID = `
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

// L-9F-001: Declarative Requirement Law
it('L-9F-001: compiled requirements contain no provider identity', () => {
  const parsed = parser.parse(VALID)
  expect(parsed.status).toBe('valid')
  if (parsed.status !== 'valid') return
  const result = compiler.compile(parsed.manifest)
  expect(result.status).toBe('compiled')
  if (result.status !== 'compiled') return
  for (const req of result.requirementSet.requirements) {
    expect(Object.keys(req)).not.toContain('providerId')
  }
})

// L-9F-002: Manifest Authority Law
it('L-9F-002: manifest is the only source of requirement declarations — scanner cannot modify it', () => {
  const parsed = parser.parse(VALID)
  expect(parsed.status).toBe('valid')
  if (parsed.status !== 'valid') return
  expect(Object.isFrozen(parsed.manifest.capabilities.required)).toBe(true)
  expect(() => {
    (parsed.manifest.capabilities as unknown as { required: unknown[] }).required.push({} as never)
  }).toThrow()
})

// L-9F-004: Canonical Compilation Law — YAML comments don't affect semanticHash
it('L-9F-004: YAML comments do not affect semanticHash', () => {
  const withComment = VALID + '# trailing comment\n'
  const r1 = parser.parse(VALID)
  const r2 = parser.parse(withComment)
  if (r1.status !== 'valid' || r2.status !== 'valid') return
  expect(r1.manifest.semanticHash).toBe(r2.manifest.semanticHash)
})

// L-9F-004 continued: different declarations change semanticHash
it('L-9F-004: different capability declarations produce different semanticHash', () => {
  const withExtra = VALID.replace('optional: []', `optional:
    - id: ai:rerank
      version: "^1.0"`)
  const r1 = parser.parse(VALID)
  const r2 = parser.parse(withExtra)
  if (r1.status !== 'valid' || r2.status !== 'valid') return
  expect(r1.manifest.semanticHash).not.toBe(r2.manifest.semanticHash)
})

// L-9F-005: Stage Boundary Law — parser is synchronous
it('L-9F-005: parse() return value has .status, not .then (synchronous)', () => {
  const result = parser.parse(VALID)
  expect('status' in result).toBe(true)
  expect(typeof (result as unknown as Record<string, unknown>)['then']).toBe('undefined')
})
