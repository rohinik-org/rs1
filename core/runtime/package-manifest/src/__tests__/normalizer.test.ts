import { it, expect } from 'vitest'
import { normalizeManifest } from '../normalizer.js'
import type { StructuredDoc } from '../structural-validator.js'

function makeDoc(overrides: Partial<StructuredDoc> = {}): StructuredDoc {
  return {
    schemaVersion: 'rohinik.package/v1',
    package: { id: 'com.example.my-package', name: 'My Package', version: '1.0.0', type: 'capability-provider' },
    ...overrides,
  }
}

it('output is frozen', () => {
  const manifest = normalizeManifest(makeDoc())
  expect(Object.isFrozen(manifest)).toBe(true)
  expect(Object.isFrozen(manifest.package)).toBe(true)
})

it('provides[] sorted by capability ID', () => {
  const doc = makeDoc({
    provides: [
      { capability: 'search:query', version: '1.0.0' },
      { capability: 'ai:generate:text', version: '1.0.0' },
      { capability: 'files:read', version: '1.0.0' },
    ],
  })
  const manifest = normalizeManifest(doc)
  expect(manifest.provides!.map(p => p.capability)).toEqual([
    'ai:generate:text', 'files:read', 'search:query',
  ])
})

it('npm deps sorted by name', () => {
  const doc = makeDoc({
    dependencies: {
      npm: [
        { name: 'zlib', version: '1.0.0' },
        { name: 'axios', version: '1.0.0' },
        { name: 'lodash', version: '4.0.0' },
      ],
    },
  })
  const manifest = normalizeManifest(doc)
  expect(manifest.dependencies!.npm!.map(d => d.name)).toEqual(['axios', 'lodash', 'zlib'])
})

it('deterministic: same input → same output', () => {
  const doc = makeDoc({
    provides: [
      { capability: 'b:cap', version: '1.0.0' },
      { capability: 'a:cap', version: '1.0.0' },
    ],
  })
  const m1 = normalizeManifest(doc)
  const m2 = normalizeManifest(doc)
  expect(JSON.stringify(m1)).toBe(JSON.stringify(m2))
})

it('schemaVersion is always rohinik.package/v1', () => {
  const manifest = normalizeManifest(makeDoc())
  expect(manifest.schemaVersion).toBe('rohinik.package/v1')
})
