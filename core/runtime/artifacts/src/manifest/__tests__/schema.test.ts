import { describe, it, expect } from 'vitest'
import { validateManifest } from '../schema.js'
import { upgradeManifest } from '../upgrader.js'

const VALID_V2 = {
  schemaVersion: '2.0', id: '@rohinik-org/mcp', version: '1.0.0',
  type: 'adapter', name: 'MCP Adapter', description: 'MCP protocol adapter',
  minimumRuntime: '>=0.1.0', minimumSdk: '1.0',
}

describe('validateManifest', () => {
  it('accepts a valid v2.0 manifest', () => {
    const manifest = validateManifest(VALID_V2)
    expect(manifest.id).toBe('@rohinik-org/mcp')
    expect(manifest.schemaVersion).toBe('2.0')
  })

  it('accepts a valid packageId (rohinik:// URI)', () => {
    const manifest = validateManifest({ ...VALID_V2, packageId: 'rohinik://aios/mcp-adapter' })
    expect(manifest.packageId).toBe('rohinik://aios/mcp-adapter')
  })

  it('rejects packageId that is not an rohinik:// URI', () => {
    expect(() => validateManifest({ ...VALID_V2, packageId: '@rohinik-org/mcp' }))
      .toThrow('packageId must be')
  })

  it('rejects packageId with version embedded', () => {
    expect(() => validateManifest({ ...VALID_V2, packageId: 'rohinik://aios/mcp-adapter@1.0.0' }))
      .toThrow()
  })

  it('accepts compilerTarget on a compiler-frontend package', () => {
    const manifest = validateManifest({
      ...VALID_V2, type: 'compiler-frontend',
      packageId: 'rohinik://aios/memory-compiler', compilerTarget: 'memory',
    })
    expect(manifest.compilerTarget).toBe('memory')
  })

  it('accepts all 7 compilerTarget values', () => {
    const targets = ['capability', 'memory', 'agent', 'federation', 'shell', 'compiler-frontend', 'benchmark']
    for (const compilerTarget of targets) {
      expect(() => validateManifest({ ...VALID_V2, type: 'compiler-frontend', compilerTarget }))
        .not.toThrow()
    }
  })

  it('rejects missing required fields', () => {
    expect(() => validateManifest({ schemaVersion: '2.0', id: '@rohinik-org/test' }))
      .toThrow('Invalid rohinik-package.json')
  })

  it('rejects invalid schemaVersion', () => {
    expect(() => validateManifest({ ...VALID_V2, schemaVersion: '1.0' })).toThrow()
  })

  it('accepts all 7 package types', () => {
    const types = ['adapter', 'capability', 'provider', 'memory', 'compiler-frontend', 'shell', 'benchmark-suite']
    for (const type of types) {
      expect(() => validateManifest({ ...VALID_V2, type })).not.toThrow()
    }
  })

  it('rejects invalid semver version', () => {
    expect(() => validateManifest({ ...VALID_V2, version: 'not-semver' })).toThrow()
  })
})

describe('validateManifest — asset and pack types', () => {
  it('accepts type: asset with assetType', () => {
    const m = validateManifest({
      ...VALID_V2, type: 'asset', assetType: 'claude-skill',
    })
    expect(m.type).toBe('asset')
    expect(m.assetType).toBe('claude-skill')
  })

  it('accepts type: pack', () => {
    const m = validateManifest({ ...VALID_V2, type: 'pack' })
    expect(m.type).toBe('pack')
  })

  it('rejects invalid assetType', () => {
    expect(() => validateManifest({ ...VALID_V2, type: 'asset', assetType: 'not-real' }))
      .toThrow('Invalid rohinik-package.json')
  })

  it('accepts all seven asset types', () => {
    const types = ['claude-skill', 'cursor-rule', 'gemini-gem', 'copilot-instruction',
                   'continue-config', 'prompt-bundle', 'generic-asset']
    for (const assetType of types) {
      expect(() => validateManifest({ ...VALID_V2, type: 'asset', assetType })).not.toThrow()
    }
  })

  it('validates law numbers up to 23', () => {
    expect(() => validateManifest({
      ...VALID_V2,
      compliance: { targetLevel: 1, laws: [21, 22, 23], benchmarkSuites: [] },
    })).not.toThrow()
  })
})

describe('upgradeManifest', () => {
  it('upgrades v1 rohinik-adapter.json to v2 RohiniKPackageManifest', () => {
    const v1 = {
      id: '@rohinik-org/mcp', version: '1.0.0', protocol: 'mcp',
      minimumRuntime: '0.1.0-alpha.1', minimumSdk: '1.0',
      permissions: ['network'], description: 'MCP adapter',
    }
    const v2 = upgradeManifest(v1)
    expect(v2.schemaVersion).toBe('2.0')
    expect(v2.type).toBe('adapter')
    expect(v2.permissions).toContain('network')
  })

  it('derives packageId from @org/name id', () => {
    const v2 = upgradeManifest({ id: '@rohinik-org/mcp', version: '1.0.0' })
    expect(v2.packageId).toBe('rohinik://rohinik-org/mcp')
  })

  it('derives packageId from bare name id', () => {
    const v2 = upgradeManifest({ id: 'my-adapter', version: '1.0.0' })
    expect(v2.packageId).toBe('rohinik://aios/my-adapter')
  })

  it('returns v2 manifest unchanged', () => {
    const v2 = upgradeManifest(VALID_V2)
    expect(v2.schemaVersion).toBe('2.0')
    expect(v2.id).toBe('@rohinik-org/mcp')
  })
})
