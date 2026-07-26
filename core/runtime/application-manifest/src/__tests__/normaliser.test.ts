import { describe, it, expect } from 'vitest'
import { buildSemanticProjection } from '../normaliser.js'
import { computeSourceHash, computeSemanticHash } from '../hasher.js'
import type { SourceDoc } from '../structural.js'

function makeDoc(caps: { required: { id: string; version: string }[]; optional: { id: string; version: string }[] } = { required: [], optional: [] }): SourceDoc {
  return {
    schemaVersion: 'rohinik.application/v1',
    application: { id: 'com.example.app', name: 'App', version: '1.0.0' },
    runtime: { language: 'nodejs' },
    capabilitiesRequired: caps.required,
    capabilitiesOptional: caps.optional,
    dependencyManagementMode: 'managed',
    resolution: { allowMarketplace: true, allowExternalRegistries: false, allowLocalPackages: true },
    degradation: { allowOptionalCapabilityFailure: true },
  }
}

// T-9F-28 — same doc twice = same semanticHash
it('identical docs produce identical semanticHash (L-9F-004)', () => {
  const proj = buildSemanticProjection(makeDoc(), [])
  const h1 = computeSemanticHash(proj)
  const h2 = computeSemanticHash(proj)
  expect(h1).toBe(h2)
})

// T-9F-29 — different declarations change semanticHash
it('different capabilities change semanticHash', () => {
  const p1 = buildSemanticProjection(makeDoc(), [])
  const p2 = buildSemanticProjection(makeDoc({ required: [{ id: 'ai:generate:text', version: '^1.0' }], optional: [] }), [])
  expect(computeSemanticHash(p1)).not.toBe(computeSemanticHash(p2))
})

// T-9F-30 — source bytes change sourceHash
it('different source bytes produce different sourceHash', () => {
  expect(computeSourceHash('a: 1')).not.toBe(computeSourceHash('a: 2'))
})

// T-9F-32 — canonical JSON sorts keys regardless of insertion order
it('semanticHash is stable regardless of key insertion order (T-9F-32)', () => {
  const first = {
    schemaVersion: 'rohinik.application/v1',
    application: { id: 'com.example.app', name: 'App', version: '1.0.0' },
  }
  const second = {
    application: { version: '1.0.0', name: 'App', id: 'com.example.app' },
    schemaVersion: 'rohinik.application/v1',
  }
  expect(computeSemanticHash(first)).toBe(computeSemanticHash(second))
})

// sourceHash is 64-char hex
it('sourceHash is 64-char lowercase hex', () => {
  expect(computeSourceHash('test')).toMatch(/^[0-9a-f]{64}$/)
})
