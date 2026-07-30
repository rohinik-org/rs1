import { it, expect } from 'vitest'
import { parsePackageManifest } from '../manifest-parser.js'

const MINIMAL_VALID = `
schemaVersion: rohinik.package/v1
package:
  id: com.example.my-package
  name: My Package
  version: 1.0.0
  type: capability-provider
`

const FULL_VALID = `
schemaVersion: rohinik.package/v1
package:
  id: com.example.my-package
  name: My Package
  version: 2.3.1
  type: capability-provider
  description: A test package
  license: MIT
publisher:
  id: com.example
  certification: verified
runtime:
  language: nodejs
  languageVersion: "20"
  entrypoint: dist/index.js
provides:
  - capability: ai:generate:text
    version: 1.0.0
  - capability: ai:embed:text
    version: 1.0.0
dependencies:
  npm:
    - name: lodash
      version: "^4"
`

it('full valid YAML → success with RohinikPackageManifestV1', () => {
  const result = parsePackageManifest(FULL_VALID)
  expect(result.success).toBe(true)
  if (!result.success) return
  expect(result.manifest.package.id).toBe('com.example.my-package')
  expect(result.manifest.package.version).toBe('2.3.1')
  expect(result.manifest.publisher?.certification).toBe('verified')
})

it('minimal valid YAML (only required fields) → success', () => {
  const result = parsePackageManifest(MINIMAL_VALID)
  expect(result.success).toBe(true)
  if (!result.success) return
  expect(result.manifest.schemaVersion).toBe('rohinik.package/v1')
})

it('invalid YAML → failure with code', () => {
  const result = parsePackageManifest(': bad:\n  - [unclosed')
  expect(result.success).toBe(false)
  if (result.success) return
  expect(result.issues.length).toBeGreaterThan(0)
})

it('unknown schemaVersion → issues with unsupported-schema', () => {
  const yaml = MINIMAL_VALID.replace('rohinik.package/v1', 'rohinik.package/v99')
  const result = parsePackageManifest(yaml)
  expect(result.success).toBe(false)
  if (result.success) return
  expect(result.issues.some(i => i.code === 'unsupported-schema')).toBe(true)
})

it('semantic error (invalid package.id) → failure with validation-failed', () => {
  const yaml = MINIMAL_VALID.replace('com.example.my-package', 'nodots')
  const result = parsePackageManifest(yaml)
  expect(result.success).toBe(false)
  if (result.success) return
  expect(result.issues.some(i => i.code === 'validation-failed')).toBe(true)
})

it('parse() is synchronous (no .then)', () => {
  const result = parsePackageManifest(MINIMAL_VALID)
  expect('success' in result).toBe(true)
  expect(typeof (result as unknown as Record<string, unknown>)['then']).toBe('undefined')
})
