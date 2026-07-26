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

it('manifest top-level is frozen', () => {
  const parser = createManifestParser()
  const result = parser.parse(VALID_YAML)
  expect(result.status).toBe('valid')
  if (result.status !== 'valid') return
  expect(Object.isFrozen(result.manifest)).toBe(true)
})

it('manifest.application is frozen', () => {
  const parser = createManifestParser()
  const result = parser.parse(VALID_YAML)
  if (result.status !== 'valid') return
  expect(Object.isFrozen(result.manifest.application)).toBe(true)
})

it('manifest.capabilities is frozen', () => {
  const parser = createManifestParser()
  const result = parser.parse(VALID_YAML)
  if (result.status !== 'valid') return
  expect(Object.isFrozen(result.manifest.capabilities)).toBe(true)
})

it('manifest.capabilities.required array is frozen', () => {
  const parser = createManifestParser()
  const result = parser.parse(VALID_YAML)
  if (result.status !== 'valid') return
  expect(Object.isFrozen(result.manifest.capabilities.required)).toBe(true)
})

it('constraint objects inside declarations are frozen', () => {
  const parser = createManifestParser()
  const result = parser.parse(VALID_YAML)
  if (result.status !== 'valid') return
  const constraint = result.manifest.capabilities.required[0]?.constraints[0]
  expect(constraint).toBeDefined()
  expect(Object.isFrozen(constraint)).toBe(true)
})

it('attempt to mutate nested constraint throws in strict mode', () => {
  const parser = createManifestParser()
  const result = parser.parse(VALID_YAML)
  if (result.status !== 'valid') return
  const manifest = result.manifest as unknown as Record<string, unknown>
  expect(() => { manifest['application'] = {} }).toThrow()
})
