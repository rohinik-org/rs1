import { describe, it, expect } from 'vitest'
import {
  definePackage,
  defineProvider,
  provideCapability,
  consumeCapability,
} from '../index.js'
import type { PackageDefinition, ProviderDefinition, CapabilityBinding, ConsumptionDescriptor } from '../index.js'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BASE_PACKAGE = {
  id: 'com.example.my-package',
  name: 'My Package',
  version: '1.0.0',
  type: 'capability-provider' as const,
}

function makePackage(overrides: Partial<typeof BASE_PACKAGE> = {}) {
  return definePackage({
    package: { ...BASE_PACKAGE, ...overrides },
    provides: [{ capability: 'com:example:greet', version: '1.0.0' }],
    consumes: [{ capability: 'com:example:log', versionRange: '^1.0.0' }],
  })
}

// ─── definePackage ────────────────────────────────────────────────────────────

describe('definePackage', () => {
  it('returns immutable package definition', () => {
    const def = makePackage()
    expect(Object.isFrozen(def)).toBe(true)
    expect(Object.isFrozen(def.package)).toBe(true)
    expect(Object.isFrozen(def.provides)).toBe(true)
    expect(Object.isFrozen(def.consumes)).toBe(true)
  })

  it('rejects invalid package id', () => {
    expect(() =>
      definePackage({ package: { ...BASE_PACKAGE, id: 'INVALID_ID' } })
    ).toThrow()
  })

  it('rejects empty package version', () => {
    expect(() =>
      definePackage({ package: { ...BASE_PACKAGE, version: '' } })
    ).toThrow()
  })

  it('rejects non-semver package version', () => {
    expect(() =>
      definePackage({ package: { ...BASE_PACKAGE, version: 'v1' } })
    ).toThrow()
    expect(() =>
      definePackage({ package: { ...BASE_PACKAGE, version: 'latest' } })
    ).toThrow()
  })

  it('defaults provides and consumes to empty arrays', () => {
    const def = definePackage({ package: BASE_PACKAGE })
    expect(def.provides).toEqual([])
    expect(def.consumes).toEqual([])
  })

  it('is side-effect free — two calls with same input produce equal output', () => {
    const a = makePackage()
    const b = makePackage()
    expect(a.package.id).toBe(b.package.id)
    expect(a.provides).toEqual(b.provides)
  })

  it('error has code invalid-input', () => {
    let err: unknown
    try { definePackage({ package: { ...BASE_PACKAGE, id: 'BAD' } }) } catch (e) { err = e }
    expect((err as { code: string }).code).toBe('invalid-input')
  })
})

// ─── provideCapability ────────────────────────────────────────────────────────

describe('provideCapability', () => {
  it('creates capability binding', () => {
    const binding = provideCapability<{ name: string }, string>('com:example:greet', '1.0.0')
    expect(binding.capabilityId).toBe('com:example:greet')
    expect(binding.version).toBe('1.0.0')
    expect(Object.isFrozen(binding)).toBe(true)
  })

  it('rejects invalid capability id', () => {
    expect(() => provideCapability('INVALID', '1.0.0')).toThrow()
  })

  it('rejects empty version', () => {
    expect(() => provideCapability('com:example:greet', '')).toThrow()
  })

  it('rejects non-semver version', () => {
    expect(() => provideCapability('com:example:greet', 'v1')).toThrow()
    expect(() => provideCapability('com:example:greet', 'latest')).toThrow()
  })

  it('accepts valid semver versions', () => {
    expect(() => provideCapability('com:example:greet', '1.0.0')).not.toThrow()
    expect(() => provideCapability('com:example:greet', '2.3.4-alpha.1')).not.toThrow()
  })

  it('error has code invalid-input', () => {
    let err: unknown
    try { provideCapability('BAD', '1.0.0') } catch (e) { err = e }
    expect((err as { code: string }).code).toBe('invalid-input')
  })
})

// ─── consumeCapability ────────────────────────────────────────────────────────

describe('consumeCapability', () => {
  it('creates consumption descriptor', () => {
    const desc = consumeCapability<{ name: string }, string>('com:example:log', '^1.0.0')
    expect(desc.capabilityId).toBe('com:example:log')
    expect(desc.versionRange).toBe('^1.0.0')
    expect(desc.optional).toBe(false)
    expect(Object.isFrozen(desc)).toBe(true)
  })

  it('optional flag set correctly', () => {
    const desc = consumeCapability('com:example:log', '^1.0.0', true)
    expect(desc.optional).toBe(true)
  })

  it('rejects invalid capability id', () => {
    expect(() => consumeCapability('INVALID', '^1.0.0')).toThrow()
  })

  it('rejects empty version range', () => {
    expect(() => consumeCapability('com:example:log', '')).toThrow()
  })
})

// ─── defineProvider ───────────────────────────────────────────────────────────

describe('defineProvider', () => {
  it('creates provider definition', () => {
    const pkg = makePackage()
    const binding = provideCapability('com:example:greet', '1.0.0')
    const provider = defineProvider({ packageDefinition: pkg, capabilities: [binding] })
    expect(provider.packageId).toBe('com.example.my-package')
    expect(Object.isFrozen(provider)).toBe(true)
    expect(Object.isFrozen(provider.capabilities)).toBe(true)
  })

  it('rejects duplicate capability ids', () => {
    const pkg = makePackage()
    const binding = provideCapability('com:example:greet', '1.0.0')
    expect(() =>
      defineProvider({ packageDefinition: pkg, capabilities: [binding, binding] })
    ).toThrow()
    let err: unknown
    try { defineProvider({ packageDefinition: pkg, capabilities: [binding, binding] }) } catch (e) { err = e }
    expect((err as { code: string }).code).toBe('validation-failed')
  })

  it('rejects capability not declared in package provides', () => {
    const pkg = makePackage()
    const undeclared = provideCapability('com:example:unknown', '1.0.0')
    let err: unknown
    try { defineProvider({ packageDefinition: pkg, capabilities: [undeclared] }) } catch (e) { err = e }
    expect((err as { code: string }).code).toBe('conformance-failed')
  })

  it('empty capabilities list is valid', () => {
    const pkg = makePackage()
    const provider = defineProvider({ packageDefinition: pkg, capabilities: [] })
    expect(provider.capabilities).toHaveLength(0)
  })
})

// ─── L-9K-003: package version does not imply capability version ──────────────

describe('L-9K-003: capability version is independent of package version', () => {
  it('package version and capability version can differ', () => {
    const pkg = definePackage({
      package: { ...BASE_PACKAGE, version: '2.0.0' },
      provides: [{ capability: 'com:example:greet', version: '3.5.1' }],
    })
    const binding = provideCapability('com:example:greet', '3.5.1')
    const provider = defineProvider({ packageDefinition: pkg, capabilities: [binding] })
    expect(provider.capabilities[0]!.version).toBe('3.5.1')
    expect(pkg.package.version).toBe('2.0.0')
  })

  it('same capability id at different versions in different packages does not conflict', () => {
    const pkgA = definePackage({
      package: { ...BASE_PACKAGE, id: 'com.example.pkg-a', version: '1.0.0' },
      provides: [{ capability: 'com:example:greet', version: '1.0.0' }],
    })
    const pkgB = definePackage({
      package: { ...BASE_PACKAGE, id: 'com.example.pkg-b', version: '1.0.0' },
      provides: [{ capability: 'com:example:greet', version: '2.0.0' }],
    })
    expect(pkgA.provides[0]!.version).toBe('1.0.0')
    expect(pkgB.provides[0]!.version).toBe('2.0.0')
  })
})

// ─── Export sentinel ──────────────────────────────────────────────────────────

describe('export sentinel', () => {
  it('all four SDK functions are exported', async () => {
    const mod = await import('../index.js')
    expect(typeof mod.definePackage).toBe('function')
    expect(typeof mod.defineProvider).toBe('function')
    expect(typeof mod.provideCapability).toBe('function')
    expect(typeof mod.consumeCapability).toBe('function')
  })
})
