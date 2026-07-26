import { describe, it, expect, vi } from 'vitest'
import { createManifestParser } from '../parser.js'
import { createManifestCompiler } from '../compiler.js'
import {
  createCapabilityRequirementBuilder,
  createProductionIdGenerator,
  createProductionClock,
} from '@rohinik-org/capability-contracts'

function makeCompiler() {
  return createManifestCompiler({
    requirementBuilder: createCapabilityRequirementBuilder({
      idGenerator: createProductionIdGenerator(),
      clock: createProductionClock(),
    }),
  })
}

const VALID_YAML = `
schemaVersion: rohinik.application/v1
application:
  id: com.example.knowledge-assistant
  name: Knowledge Assistant
  version: 0.1.0
runtime:
  language: nodejs
capabilities:
  required:
    - id: ai:generate:text
      version: "^1.0"
    - id: document:parse
      version: "^1.0"
  optional:
    - id: ai:rerank
      version: "^1.0"
dependencyManagement:
  mode: managed
resolution:
  allowMarketplace: true
  allowExternalRegistries: false
  allowLocalPackages: true
degradation:
  allowOptionalCapabilityFailure: true
`

// T-9F-34 — requirementIds come from Stage 9E-2, not position-derived
it('requirementIds are non-empty (assigned by Stage 9E-2 builder)', () => {
  const parsed = createManifestParser().parse(VALID_YAML)
  expect(parsed.status).toBe('valid')
  if (parsed.status !== 'valid') return
  const result = makeCompiler().compile(parsed.manifest)
  expect(result.status).toBe('compiled')
  if (result.status !== 'compiled') return
  for (const req of result.requirementSet.requirements) {
    expect(req.requirementId.length).toBeGreaterThan(0)
  }
})

// T-9F-36 — requestedBy identifies the application
it('requestedBy.direct.kind is application with manifest applicationId', () => {
  const parsed = createManifestParser().parse(VALID_YAML)
  if (parsed.status !== 'valid') return
  const result = makeCompiler().compile(parsed.manifest)
  if (result.status !== 'compiled') return

  for (const req of result.requirementSet.requirements) {
    expect(req.requestedBy.direct.kind).toBe('application')
    if (req.requestedBy.direct.kind === 'application') {
      expect(req.requestedBy.direct.applicationId).toBe('com.example.knowledge-assistant')
    }
  }
})

// T-9F-37 — declaration map preserves source path without affecting identity
it('declarationMap entries have correct declarationPath and necessity', () => {
  const parsed = createManifestParser().parse(VALID_YAML)
  if (parsed.status !== 'valid') return
  const result = makeCompiler().compile(parsed.manifest)
  if (result.status !== 'compiled') return

  const textEntry = result.declarationMap.find(e => e.capabilityId === 'ai:generate:text')
  const rerankEntry = result.declarationMap.find(e => e.capabilityId === 'ai:rerank')

  expect(textEntry?.declarationPath).toContain('capabilities.required')
  expect(textEntry?.necessity).toBe('required')
  expect(rerankEntry?.declarationPath).toContain('capabilities.optional')
  expect(rerankEntry?.necessity).toBe('optional')
})

// Correct count
it('requirementSet has correct total requirement count', () => {
  const parsed = createManifestParser().parse(VALID_YAML)
  if (parsed.status !== 'valid') return
  const result = makeCompiler().compile(parsed.manifest)
  if (result.status !== 'compiled') return
  expect(result.requirementSet.requirements).toHaveLength(3) // 2 required + 1 optional
})

// Necessity mapping
it('required capability has necessity=required, optional has necessity=optional', () => {
  const parsed = createManifestParser().parse(VALID_YAML)
  if (parsed.status !== 'valid') return
  const result = makeCompiler().compile(parsed.manifest)
  if (result.status !== 'compiled') return

  const gen = result.requirementSet.requirements.find(r => r.capabilityId === 'ai:generate:text')
  const rerank = result.requirementSet.requirements.find(r => r.capabilityId === 'ai:rerank')
  expect(gen?.necessity).toBe('required')
  expect(rerank?.necessity).toBe('optional')
})

// T-9F-34 (stronger) — ID delegation proof via injected fake builder
it('requirementIds come entirely from the injected builder (T-9F-34 delegation proof)', () => {
  const SENTINEL_ID = 'sentinel-req-id-from-9e2'
  const fakeBuilder = {
    prepare: (_draft: unknown) => ({
      status: 'ok' as const,
      prepared: { _draft },
    }),
    materialize: (_prepared: unknown) => ({
      interned: {
        set: {
          requirements: [
            {
              requirementId: SENTINEL_ID,
              capabilityId: 'ai:generate:text',
              necessity: 'required',
              versionRange: '^1.0',
              multiplicity: 'single',
              constraints: [],
              requirementHash: 'sentinel-hash',
              requestedBy: { direct: { kind: 'application', applicationId: 'com.example.knowledge-assistant' }, chain: [] },
              createdAt: '2026-07-26T00:00:00.000Z',
            },
          ],
          setHash: 'sentinel-set-hash',
          applicationId: 'com.example.knowledge-assistant',
        },
      },
    }),
  }

  // Simple 1-capability manifest for the fake builder
  const SIMPLE_YAML = `
schemaVersion: rohinik.application/v1
application:
  id: com.example.knowledge-assistant
  name: Knowledge Assistant
  version: 0.1.0
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
  const parsed = createManifestParser().parse(SIMPLE_YAML)
  expect(parsed.status).toBe('valid')
  if (parsed.status !== 'valid') return

  const compiler = createManifestCompiler({ requirementBuilder: fakeBuilder as never })
  const result = compiler.compile(parsed.manifest)
  expect(result.status).toBe('compiled')
  if (result.status !== 'compiled') return

  // Stage 9F must use exactly the ID returned by the injected builder
  expect(result.requirementSet.requirements[0]?.requirementId).toBe(SENTINEL_ID)
})
