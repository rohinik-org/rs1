import { describe, it, expect } from 'vitest'
import {
  declareConfiguration,
  declarePermissions,
  declareDependencies,
  compareManifestConsistency,
  definePackage,
} from '../index.js'
import type { RohinikPackageManifestV1 } from '@rohinik-org/package-manifest-ir'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BASE_PACKAGE = {
  id: 'com.example.pkg',
  name: 'Pkg',
  version: '1.0.0',
  type: 'capability-provider' as const,
}

function makeManifest(overrides: Partial<RohinikPackageManifestV1> = {}): RohinikPackageManifestV1 {
  return {
    schemaVersion: 'rohinik.package/v1',
    package: BASE_PACKAGE,
    ...overrides,
  }
}

// ─── declareConfiguration ─────────────────────────────────────────────────────

describe('declareConfiguration', () => {
  it('L-9K-004: secret defaults are prohibited', () => {
    // SecretDeclaration has no `default` field in the IR type, but we guard against duck-typed input
    expect(() =>
      declareConfiguration({
        secrets: [{ name: 'API_KEY', required: true, ...(({ default: 'fallback' }) as Record<string, unknown>) }],
      })
    ).toThrow()
    let err: unknown
    try {
      declareConfiguration({
        secrets: [Object.assign({ name: 'API_KEY', required: true }, { default: 'fallback' })],
      })
    } catch (e) {
      err = e
    }
    expect((err as { code: string }).code).toBe('invalid-input')
  })

  it('accepts valid secret without default', () => {
    const config = declareConfiguration({
      secrets: [{ name: 'API_KEY', required: true }],
    })
    expect(config.secrets).toHaveLength(1)
    expect(config.secrets[0]!.name).toBe('API_KEY')
  })

  it('secret name is required', () => {
    expect(() =>
      declareConfiguration({ secrets: [{ name: '', required: true }] })
    ).toThrow()
  })

  it('env var name is required', () => {
    expect(() =>
      declareConfiguration({ environment: [{ name: '', required: false }] })
    ).toThrow()
  })

  it('returns immutable definition', () => {
    const config = declareConfiguration({
      secrets: [{ name: 'KEY', required: true }],
      environment: [{ name: 'PORT', required: false, default: '3000' }],
    })
    expect(Object.isFrozen(config)).toBe(true)
    expect(Object.isFrozen(config.secrets)).toBe(true)
    expect(Object.isFrozen(config.environment)).toBe(true)
  })

  it('defaults to empty arrays when nothing declared', () => {
    const config = declareConfiguration({})
    expect(config.secrets).toHaveLength(0)
    expect(config.environment).toHaveLength(0)
  })
})

// ─── declarePermissions ───────────────────────────────────────────────────────

describe('declarePermissions', () => {
  it('L-9K-005: normalization never expands scope', () => {
    const perm = declarePermissions({
      network: {
        outbound: [{ host: 'api.example.com', protocols: ['https'] }],
      },
    })
    // Only the declared host present — no extras added
    expect(perm.network.outbound!).toHaveLength(1)
    expect((perm.network.outbound![0] as { host: string }).host).toBe('api.example.com')
  })

  it('empty permissions are valid', () => {
    const perm = declarePermissions({})
    expect(perm.network.outbound).toHaveLength(0)
    expect(perm.secrets.consume).toHaveLength(0)
  })

  it('duplicate outbound network rule for same host is rejected (contradictory)', () => {
    let err: unknown
    try {
      declarePermissions({
        network: {
          outbound: [
            { host: 'api.example.com', protocols: ['https'] },
            { host: 'api.example.com', protocols: ['http'] },
          ],
        },
      })
    } catch (e) {
      err = e
    }
    expect((err as { code: string }).code).toBe('validation-failed')
  })

  it('missing host in network rule is rejected', () => {
    expect(() =>
      declarePermissions({ network: { outbound: [{ host: '', protocols: ['https'] }] } })
    ).toThrow()
  })

  it('returns immutable definition', () => {
    const perm = declarePermissions({ secrets: { consume: ['MY_SECRET'] } })
    expect(Object.isFrozen(perm)).toBe(true)
    expect(Object.isFrozen(perm.network)).toBe(true)
    expect(Object.isFrozen(perm.secrets)).toBe(true)
  })
})

// ─── declareDependencies ──────────────────────────────────────────────────────

describe('declareDependencies', () => {
  it('npm declarations compared deterministically with identical input', () => {
    const a = declareDependencies({ npm: [{ name: 'express', version: '^4.0.0' }] })
    const b = declareDependencies({ npm: [{ name: 'express', version: '^4.0.0' }] })
    expect(a.npm[0]!.name).toBe(b.npm[0]!.name)
    expect(a.npm[0]!.version).toBe(b.npm[0]!.version)
  })

  it('npm dependency requires name', () => {
    expect(() => declareDependencies({ npm: [{ name: '', version: '^1.0.0' }] })).toThrow()
  })

  it('npm dependency requires version', () => {
    expect(() => declareDependencies({ npm: [{ name: 'lodash', version: '' }] })).toThrow()
  })

  it('rohinik dependency id must match package id pattern', () => {
    expect(() => declareDependencies({ rohinik: ['INVALID_ID'] })).toThrow()
    let err: unknown
    try { declareDependencies({ rohinik: ['INVALID'] }) } catch (e) { err = e }
    expect((err as { code: string }).code).toBe('invalid-input')
  })

  it('language dependency requires language and versionRange', () => {
    expect(() => declareDependencies({ language: [{ language: '', versionRange: '^18' }] })).toThrow()
    expect(() => declareDependencies({ language: [{ language: 'node', versionRange: '' }] })).toThrow()
  })

  it('model dependency requires modelId', () => {
    expect(() => declareDependencies({ model: [{ modelId: '' }] })).toThrow()
  })

  it('infrastructure dependency requires kind', () => {
    expect(() => declareDependencies({ infrastructure: [{ kind: '' }] })).toThrow()
  })

  it('returns immutable definition', () => {
    const deps = declareDependencies({
      npm: [{ name: 'zod', version: '^3.0.0' }],
      language: [{ language: 'node', versionRange: '>=18' }],
    })
    expect(Object.isFrozen(deps)).toBe(true)
    expect(Object.isFrozen(deps.npm)).toBe(true)
    expect(Object.isFrozen(deps.language)).toBe(true)
  })
})

// ─── compareManifestConsistency ───────────────────────────────────────────────

describe('compareManifestConsistency', () => {
  it('consistent when SDK and manifest capabilities match', () => {
    const pkg = definePackage({
      package: BASE_PACKAGE,
      provides: [{ capability: 'com:example:greet', version: '1.0.0' }],
    })
    const manifest = makeManifest({
      provides: [{ capability: 'com:example:greet', version: '1.0.0' }],
    })
    const report = compareManifestConsistency({ packageDefinition: pkg, manifest })
    expect(report.consistent).toBe(true)
    expect(report.mismatches).toHaveLength(0)
  })

  it('undeclared capability consumption is reported (capability in SDK not in manifest)', () => {
    const pkg = definePackage({
      package: BASE_PACKAGE,
      provides: [{ capability: 'com:example:greet', version: '1.0.0' }],
    })
    const manifest = makeManifest({ provides: [] })
    const report = compareManifestConsistency({ packageDefinition: pkg, manifest })
    expect(report.consistent).toBe(false)
    expect(report.mismatches.some((m) => m.code === 'capability-undeclared-in-manifest')).toBe(true)
  })

  it('capability in manifest not in SDK is reported', () => {
    const pkg = definePackage({ package: BASE_PACKAGE })
    const manifest = makeManifest({
      provides: [{ capability: 'com:example:greet', version: '1.0.0' }],
    })
    const report = compareManifestConsistency({ packageDefinition: pkg, manifest })
    expect(report.consistent).toBe(false)
    expect(report.mismatches.some((m) => m.code === 'capability-undeclared-in-sdk')).toBe(true)
  })

  it('npm version mismatch is reported', () => {
    const pkg = definePackage({ package: BASE_PACKAGE })
    const manifest = makeManifest({
      dependencies: { npm: [{ name: 'zod', version: '^3.0.0' }] },
    })
    const deps = declareDependencies({ npm: [{ name: 'zod', version: '^2.0.0' }] })
    const report = compareManifestConsistency({ packageDefinition: pkg, manifest, dependencies: deps })
    expect(report.consistent).toBe(false)
    expect(report.mismatches.some((m) => m.code === 'npm-version-mismatch')).toBe(true)
  })

  it('npm in SDK not in manifest is reported', () => {
    const pkg = definePackage({ package: BASE_PACKAGE })
    const manifest = makeManifest({})
    const deps = declareDependencies({ npm: [{ name: 'zod', version: '^3.0.0' }] })
    const report = compareManifestConsistency({ packageDefinition: pkg, manifest, dependencies: deps })
    expect(report.consistent).toBe(false)
    expect(report.mismatches.some((m) => m.code === 'npm-undeclared-in-manifest')).toBe(true)
  })

  it('npm in manifest not in SDK is reported', () => {
    const pkg = definePackage({ package: BASE_PACKAGE })
    const manifest = makeManifest({
      dependencies: { npm: [{ name: 'express', version: '^4.0.0' }] },
    })
    const deps = declareDependencies({})
    const report = compareManifestConsistency({ packageDefinition: pkg, manifest, dependencies: deps })
    expect(report.consistent).toBe(false)
    expect(report.mismatches.some((m) => m.code === 'npm-undeclared-in-sdk')).toBe(true)
  })

  it('report is immutable', () => {
    const pkg = definePackage({ package: BASE_PACKAGE })
    const manifest = makeManifest({})
    const report = compareManifestConsistency({ packageDefinition: pkg, manifest })
    expect(Object.isFrozen(report)).toBe(true)
    expect(Object.isFrozen(report.mismatches)).toBe(true)
  })
})

// ─── Export sentinel ──────────────────────────────────────────────────────────

describe('export sentinel — Task 4', () => {
  it('all Task 4 functions are exported', async () => {
    const mod = await import('../index.js')
    expect(typeof mod.declareConfiguration).toBe('function')
    expect(typeof mod.declarePermissions).toBe('function')
    expect(typeof mod.declareDependencies).toBe('function')
    expect(typeof mod.compareManifestConsistency).toBe('function')
  })
})
