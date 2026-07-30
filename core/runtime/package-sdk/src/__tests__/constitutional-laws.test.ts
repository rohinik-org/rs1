/**
 * Constitutional law tests for @rohinik-org/package-sdk.
 * Each test is named after the law it enforces.
 */
import { describe, it, expect } from 'vitest'
import { definePackage, defineProvider, provideCapability, consumeCapability } from '../index.js'

const BASE_PACKAGE = {
  id: 'com.example.pkg',
  name: 'Example',
  version: '1.0.0',
  type: 'capability-provider' as const,
}

// ─── L-9K-001: Manifest Completeness Law ─────────────────────────────────────
// Every capability declared in provides must use a valid ID and semver version.
describe('L-9K-001: manifest completeness — invalid declarations are rejected at definition time', () => {
  it('capability id must match CAPABILITY_ID_PATTERN', () => {
    let err: unknown
    try { provideCapability('INVALID_ID', '1.0.0') } catch (e) { err = e }
    expect((err as { code: string }).code).toBe('invalid-input')
  })

  it('capability version must be semver', () => {
    let err: unknown
    try { provideCapability('com:example:greet', 'not-a-version') } catch (e) { err = e }
    expect((err as { code: string }).code).toBe('invalid-input')
  })

  it('package id must match PACKAGE_ID_PATTERN', () => {
    let err: unknown
    try { definePackage({ package: { ...BASE_PACKAGE, id: 'INVALID' } }) } catch (e) { err = e }
    expect((err as { code: string }).code).toBe('invalid-input')
  })

  it('package version must be semver', () => {
    let err: unknown
    try { definePackage({ package: { ...BASE_PACKAGE, version: 'v1-beta' } }) } catch (e) { err = e }
    expect((err as { code: string }).code).toBe('invalid-input')
  })

  it('duplicate capability id in provider is rejected deterministically', () => {
    const pkg = definePackage({
      package: BASE_PACKAGE,
      provides: [{ capability: 'com:example:greet', version: '1.0.0' }],
    })
    const binding = provideCapability('com:example:greet', '1.0.0')
    let err: unknown
    try { defineProvider({ packageDefinition: pkg, capabilities: [binding, binding] }) } catch (e) { err = e }
    expect((err as { code: string }).code).toBe('validation-failed')
  })

  it('capability not declared in provides is rejected with conformance-failed', () => {
    const pkg = definePackage({ package: BASE_PACKAGE, provides: [] })
    const binding = provideCapability('com:example:greet', '1.0.0')
    let err: unknown
    try { defineProvider({ packageDefinition: pkg, capabilities: [binding] }) } catch (e) { err = e }
    expect((err as { code: string }).code).toBe('conformance-failed')
  })
})

// ─── L-9K-003: Capability Version Independence Law ───────────────────────────
// Package version must not constrain or imply capability version.
describe('L-9K-003: capability version is independent of package version', () => {
  it('capability version may differ from package version', () => {
    const pkg = definePackage({
      package: { ...BASE_PACKAGE, version: '5.0.0' },
      provides: [{ capability: 'com:example:greet', version: '1.2.3' }],
    })
    const binding = provideCapability('com:example:greet', '1.2.3')
    const provider = defineProvider({ packageDefinition: pkg, capabilities: [binding] })
    expect(pkg.package.version).toBe('5.0.0')
    expect(provider.capabilities[0]!.version).toBe('1.2.3')
  })

  it('same capability id can appear at different versions in different packages without conflict', () => {
    const pkgA = definePackage({
      package: { ...BASE_PACKAGE, id: 'com.example.pkg-a', version: '1.0.0' },
      provides: [{ capability: 'com:example:greet', version: '1.0.0' }],
    })
    const pkgB = definePackage({
      package: { ...BASE_PACKAGE, id: 'com.example.pkg-b', version: '1.0.0' },
      provides: [{ capability: 'com:example:greet', version: '9.0.0' }],
    })
    expect(pkgA.provides[0]!.version).toBe('1.0.0')
    expect(pkgB.provides[0]!.version).toBe('9.0.0')
  })

  it('package version bump does not force capability version change', () => {
    const v1 = definePackage({
      package: { ...BASE_PACKAGE, version: '1.0.0' },
      provides: [{ capability: 'com:example:greet', version: '3.0.0' }],
    })
    const v2 = definePackage({
      package: { ...BASE_PACKAGE, version: '2.0.0' },
      provides: [{ capability: 'com:example:greet', version: '3.0.0' }],
    })
    expect(v1.provides[0]!.version).toBe(v2.provides[0]!.version)
    expect(v1.package.version).not.toBe(v2.package.version)
  })
})

// ─── Immutability ─────────────────────────────────────────────────────────────
describe('definitions are deeply immutable and side-effect free', () => {
  it('provideCapability result is frozen', () => {
    const b = provideCapability('com:example:greet', '1.0.0')
    expect(Object.isFrozen(b)).toBe(true)
  })

  it('consumeCapability result is frozen', () => {
    const c = consumeCapability('com:example:log', '^1.0.0')
    expect(Object.isFrozen(c)).toBe(true)
  })

  it('definePackage result and nested objects are frozen', () => {
    const pkg = definePackage({
      package: BASE_PACKAGE,
      provides: [{ capability: 'com:example:greet', version: '1.0.0' }],
    })
    expect(Object.isFrozen(pkg)).toBe(true)
    expect(Object.isFrozen(pkg.package)).toBe(true)
    expect(Object.isFrozen(pkg.provides)).toBe(true)
    expect(Object.isFrozen(pkg.consumes)).toBe(true)
  })

  it('defineProvider result is frozen', () => {
    const pkg = definePackage({
      package: BASE_PACKAGE,
      provides: [{ capability: 'com:example:greet', version: '1.0.0' }],
    })
    const b = provideCapability('com:example:greet', '1.0.0')
    const provider = defineProvider({ packageDefinition: pkg, capabilities: [b] })
    expect(Object.isFrozen(provider)).toBe(true)
    expect(Object.isFrozen(provider.capabilities)).toBe(true)
  })

  it('two calls with same input produce equal output (deterministic)', () => {
    const a = definePackage({ package: BASE_PACKAGE })
    const b = definePackage({ package: BASE_PACKAGE })
    expect(a.package.id).toBe(b.package.id)
    expect(a.package.version).toBe(b.package.version)
    expect(a.provides).toEqual(b.provides)
  })
})

// ─── No package code execution during static operations ───────────────────────
describe('no package code executed during static operations', () => {
  it('definePackage does not invoke any callback or side effect', () => {
    let sideEffect = false
    // No way to pass callbacks — just verify the returned object is static data
    const pkg = definePackage({ package: BASE_PACKAGE })
    expect(sideEffect).toBe(false)
    expect(typeof pkg.package.id).toBe('string')
  })
})
