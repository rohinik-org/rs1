import { describe, it, expect } from 'vitest'
import type {
  RohiniKPackageManifest, AiosPackageType, AiosCompilerTarget, PackageCoordinate,
  RohiniKAssetType, PackContentsEntry, RohiniKPackManifest, PackCurriculum,
} from '../rohinik-package-manifest.js'
import type { ComplianceCertificate } from '../compliance-certificate.js'

describe('RohiniKPackageManifest', () => {
  it('accepts a minimal v2.0 manifest', () => {
    const manifest: RohiniKPackageManifest = {
      schemaVersion: '2.0',
      id: '@rohinik-org/mcp',
      version: '1.0.0',
      type: 'adapter',
      name: 'MCP Adapter',
      description: 'MCP protocol adapter',
      minimumRuntime: '>=0.1.0-alpha.1',
      minimumSdk: '1.0',
    }
    expect(manifest.schemaVersion).toBe('2.0')
    expect(manifest.type).toBe('adapter')
  })

  it('accepts canonical packageId (rohinik:// URI)', () => {
    const manifest: RohiniKPackageManifest = {
      schemaVersion: '2.0',
      id: '@rohinik-org/mcp',
      packageId: 'rohinik://aios/mcp-adapter',
      version: '1.0.0',
      type: 'adapter',
      name: 'MCP Adapter',
      description: 'MCP protocol adapter',
      minimumRuntime: '>=0.1.0-alpha.1',
      minimumSdk: '1.0',
    }
    expect(manifest.packageId).toBe('rohinik://aios/mcp-adapter')
  })

  it('accepts reserved compilerTarget field', () => {
    const manifest: RohiniKPackageManifest = {
      schemaVersion: '2.0',
      id: '@rohinik-org/memory-compiler',
      packageId: 'rohinik://aios/memory-compiler',
      version: '1.0.0',
      type: 'compiler-frontend',
      compilerTarget: 'memory',
      name: 'Memory Compiler',
      description: 'Phase 6 memory compiler frontend',
      minimumRuntime: '>=0.1.0-alpha.1',
      minimumSdk: '1.0',
    }
    expect(manifest.compilerTarget).toBe('memory')
  })

  it('accepts all 7 package types', () => {
    const types: AiosPackageType[] = [
      'adapter', 'capability', 'provider', 'memory',
      'compiler-frontend', 'shell', 'benchmark-suite',
    ]
    for (const type of types) {
      const m: RohiniKPackageManifest = {
        schemaVersion: '2.0', id: 'test', version: '1.0.0',
        type, name: 'Test', description: 'Test', minimumRuntime: '>=0.1.0', minimumSdk: '1.0',
      }
      expect(m.type).toBe(type)
    }
  })

  it('accepts all reserved compilerTarget values', () => {
    const targets: AiosCompilerTarget[] = [
      'capability', 'memory', 'agent', 'federation', 'shell', 'compiler-frontend', 'benchmark',
    ]
    for (const compilerTarget of targets) {
      const m: RohiniKPackageManifest = {
        schemaVersion: '2.0', id: 'test', version: '1.0.0',
        type: 'compiler-frontend', compilerTarget,
        name: 'Test', description: 'Test', minimumRuntime: '>=0.1.0', minimumSdk: '1.0',
      }
      expect(m.compilerTarget).toBe(compilerTarget)
    }
  })

  it('accepts optional trust block', () => {
    const manifest: RohiniKPackageManifest = {
      schemaVersion: '2.0', id: '@org/pkg', version: '1.0.0', type: 'adapter',
      name: 'Test', description: 'Test', minimumRuntime: '>=0.1.0', minimumSdk: '1.0',
      trust: {
        publisher: { name: 'Rohinik Project', publicKey: 'base64-key' },
        signature: 'base64-sig',
        contentHash: 'sha256-hash',
        signedAt: '2026-07-08T00:00:00Z',
      },
    }
    expect(manifest.trust?.publisher.name).toBe('Rohinik Project')
  })
})

describe('PackageCoordinate', () => {
  it('combines identity + version + source', () => {
    const coord: PackageCoordinate = {
      packageId: 'rohinik://aios/mcp-adapter',
      version: '1.0.0',
      source: { scheme: 'npm', location: '@rohinik-org/mcp@1.0.0' },
    }
    expect(coord.packageId).toBe('rohinik://aios/mcp-adapter')
    expect(coord.version).toBe('1.0.0')
    expect(coord.source.scheme).toBe('npm')
  })
})

describe('ComplianceCertificate', () => {
  it('records compliance scan results', () => {
    const cert: ComplianceCertificate = {
      achievedLevel: 1,
      architectureScore: 100,
      violations: [],
      certifiedAt: '2026-07-08T00:00:00Z',
      certifiedBy: '@aios-tools/benchmark-runner-node@1.0.0',
    }
    expect(cert.achievedLevel).toBe(1)
    expect(cert.violations).toHaveLength(0)
  })
})

describe('RohiniKAssetType + RohiniKPackManifest', () => {
  it('accepts all seven asset types', () => {
    const types: RohiniKAssetType[] = [
      'claude-skill', 'cursor-rule', 'gemini-gem', 'copilot-instruction',
      'continue-config', 'prompt-bundle', 'generic-asset',
    ]
    for (const assetType of types) {
      const m: RohiniKPackageManifest = {
        schemaVersion: '2.0', id: 'test', version: '1.0.0',
        type: 'asset', assetType,
        name: 'Test', description: 'Test', minimumRuntime: '>=0.1.0', minimumSdk: '1.0',
      }
      expect(m.assetType).toBe(assetType)
    }
  })

  it('accepts pack type in AiosPackageType', () => {
    const m: RohiniKPackageManifest = {
      schemaVersion: '2.0', id: 'my-pack', version: '1.0.0',
      type: 'pack',
      name: 'My Pack', description: 'A pack', minimumRuntime: '>=0.1.0', minimumSdk: '1.0',
    }
    expect(m.type).toBe('pack')
  })

  it('accepts PackContentsEntry shape', () => {
    const entry: PackContentsEntry = {
      packageId: 'rohinik://aios/some-skill',
      version: '>=1.0.0',
    }
    expect(entry.packageId).toBe('rohinik://aios/some-skill')
  })

  it('accepts RohiniKPackManifest with contents array', () => {
    const pack: RohiniKPackManifest = {
      schemaVersion: '2.0', id: 'my-pack', version: '1.0.0',
      type: 'pack',
      name: 'Engineering Pack', description: 'CAD capabilities',
      minimumRuntime: '>=0.1.0', minimumSdk: '1.0',
      contents: [
        { packageId: 'rohinik://anthropic/autocad-skill', version: '>=1.0.0' },
        { packageId: 'rohinik://cursor/cad-rules', version: '>=1.0.0', optional: true },
      ],
    }
    expect(pack.contents).toHaveLength(2)
    expect(pack.contents[0]?.packageId).toBe('rohinik://anthropic/autocad-skill')
  })

  it('accepts optional tier and curriculum fields', () => {
    const pack: RohiniKPackManifest = {
      schemaVersion: '2.0', id: 'data-science-pack', version: '1.0.0',
      type: 'pack', name: 'Data Science Pack', description: 'Data science capabilities',
      minimumRuntime: '>=0.1.0-beta.1', minimumSdk: '1.0',
      contents: [{ packageId: 'rohinik://aios/pandas-skill', version: '>=1.0.0' }],
      tier: 3,
      curriculum: { objective: 'Learn cross-capability graph composition', demonstrates: ['REQUIRES_HOST', 'PRODUCES', 'CONSUMES'] },
    }
    expect(pack.tier).toBe(3)
    expect(pack.curriculum?.objective).toContain('cross-capability')
  })
})
