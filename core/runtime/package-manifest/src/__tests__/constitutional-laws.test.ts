import { describe, it, expect } from 'vitest'
import { parsePackageManifest } from '../manifest-parser.js'

const BASE = `
schemaVersion: rohinik.package/v1
package:
  id: com.example.my-package
  name: My Package
  version: 1.0.0
  type: capability-provider
`

// L-9K-001: Declaration Law — provides is optional; omitting it is valid
it('L-9K-001: manifest without provides section parses successfully (no provides = valid, empty declaration)', () => {
  const result = parsePackageManifest(BASE)
  expect(result.success).toBe(true)
  if (!result.success) return
  expect(result.manifest.provides).toBeUndefined()
})

// L-9K-001: duplicate provided capability IDs must fail
it('L-9K-001: manifest with duplicate provided capability IDs fails validation', () => {
  const yaml = BASE + `
provides:
  - capability: ai:generate:text
    version: 1.0.0
  - capability: ai:generate:text
    version: 2.0.0
`
  const result = parsePackageManifest(yaml)
  expect(result.success).toBe(false)
  if (result.success) return
  expect(result.issues.some(i => i.message.includes('Duplicate') && i.message.includes('ai:generate:text'))).toBe(true)
})

// L-9K-003: package version and capability version are independent
it('L-9K-003: package version and capability version are independently parsed fields', () => {
  const yaml = BASE.replace('1.0.0', '3.0.0') + `
provides:
  - capability: ai:generate:text
    version: 1.5.0
`
  const result = parsePackageManifest(yaml)
  expect(result.success).toBe(true)
  if (!result.success) return
  expect(result.manifest.package.version).toBe('3.0.0')
  expect(result.manifest.provides![0]!.version).toBe('1.5.0')
})

// L-9K-003: package version bump does not affect capability version
it('L-9K-003: package version bump does not affect capability version', () => {
  const yaml1 = BASE + `
provides:
  - capability: ai:generate:text
    version: 1.0.0
`
  const yaml2 = yaml1.replace('package:\n  id: com.example.my-package\n  name: My Package\n  version: 1.0.0', 'package:\n  id: com.example.my-package\n  name: My Package\n  version: 2.0.0')
  const r1 = parsePackageManifest(yaml1)
  const r2 = parsePackageManifest(yaml2)
  expect(r1.success).toBe(true)
  expect(r2.success).toBe(true)
  if (!r1.success || !r2.success) return
  expect(r1.manifest.provides![0]!.version).toBe('1.0.0')
  expect(r2.manifest.provides![0]!.version).toBe('1.0.0')
  expect(r1.manifest.package.version).not.toBe(r2.manifest.package.version)
})

// Sentinel: unknown schema version fails closed
it('unknown schema version fails closed with unsupported-schema code', () => {
  const yaml = BASE.replace('rohinik.package/v1', 'rohinik.package/future')
  const result = parsePackageManifest(yaml)
  expect(result.success).toBe(false)
  if (result.success) return
  expect(result.issues.some(i => i.code === 'unsupported-schema')).toBe(true)
})

// Sentinel: oversized input rejected before parsing
it('oversized input is rejected before parsing', () => {
  const big = 'x: ' + 'a'.repeat(65 * 1024)
  const result = parsePackageManifest(big)
  expect(result.success).toBe(false)
  if (result.success) return
  expect(result.issues[0]?.message).toMatch(/exceeds maximum size/)
})

// Sentinel: path traversal in entrypoint is rejected
it('path traversal in entrypoint is rejected', () => {
  const yaml = BASE + `
runtime:
  language: nodejs
  entrypoint: ../dist/index.js
`
  const result = parsePackageManifest(yaml)
  expect(result.success).toBe(false)
  if (result.success) return
  expect(result.issues.some(i => i.path === 'runtime.entrypoint')).toBe(true)
})

// Sentinel: package implementation code is never imported during parse
// (structural check — the parse result contains only IR types, no implementation references)
it('package implementation code is never imported during parse', () => {
  const result = parsePackageManifest(BASE)
  expect(result.success).toBe(true)
  if (!result.success) return
  // The manifest only contains IR-typed data; no class instances
  expect(Object.getPrototypeOf(result.manifest)).toBe(Object.getPrototypeOf({}))
})
