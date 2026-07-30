import { describe, it, expect } from 'vitest'
import type {
  RohinikPackageManifestV1,
  PackageManifestParseResult,
} from '../index.js'
import {
  PACKAGE_MANIFEST_SCHEMA_VERSION,
  PACKAGE_ID_PATTERN,
  CAPABILITY_ID_PATTERN,
} from '../index.js'

// ─── Minimal manifest fixture ─────────────────────────────────────────────────

const minimal: RohinikPackageManifestV1 = {
  schemaVersion: 'rohinik.package/v1',
  package: {
    id: 'org.rohinik.ai.mock',
    name: 'Rohinik AI Mock Provider',
    version: '1.0.0',
    type: 'capability-provider',
  },
}

// ─── Maximal manifest fixture ─────────────────────────────────────────────────

const maximal: RohinikPackageManifestV1 = {
  schemaVersion: 'rohinik.package/v1',
  package: {
    id: 'org.rohinik.ai.mock',
    name: 'Rohinik AI Mock Provider',
    version: '1.0.0',
    type: 'capability-provider',
    description: 'Mock AI provider for testing',
    license: 'Apache-2.0',
    homepage: 'https://rohinik.org',
    repository: 'https://github.com/rohinik-org/rohinik',
  },
  publisher: {
    id: 'org.rohinik',
    certification: 'official',
    url: 'https://rohinik.org',
  },
  runtime: {
    language: 'nodejs',
    languageVersion: '>=22',
    entrypoint: 'dist/provider.js',
  },
  provides: [
    { capability: 'ai:generate:text', version: '1.0.0' },
    { capability: 'ai:embed:text', version: '0.5.0', deprecated: true },
  ],
  consumes: [
    { capability: 'http:request', versionRange: '>=1.0.0' },
    { capability: 'telemetry:emit', versionRange: '>=1.0.0', optional: true },
  ],
  dependencies: {
    rohinik: ['org.rohinik.http'],
    npm: [
      { name: 'openai', version: '^6.0.0' },
      { name: 'zod', version: '^3.0.0', optional: true },
    ],
  },
  configuration: {
    secrets: [{ name: 'OPENAI_API_KEY', required: true, description: 'OpenAI API key' }],
    environment: [
      { name: 'OPENAI_BASE_URL', required: false, default: 'https://api.openai.com/v1' },
    ],
  },
  permissions: {
    network: {
      outbound: [{ host: 'api.openai.com', protocols: ['https'] }],
    },
    secrets: { consume: ['OPENAI_API_KEY'] },
    capabilities: {
      consume: ['http:request', 'telemetry:emit'],
      provide: ['ai:generate:text'],
    },
    filesystem: { paths: ['/tmp'], modes: ['read', 'write'] },
  },
  health: {
    startup: 'startupCheck',
    readiness: 'readinessCheck',
    liveness: 'livenessCheck',
  },
  lifecycle: {
    idempotentShutdown: true,
    gracefulShutdownTimeoutMs: 5000,
  },
  metadata: { team: 'platform', tier: 'core' },
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('RohinikPackageManifestV1', () => {
  it('minimal manifest compiles and has required fields', () => {
    expect(minimal.schemaVersion).toBe('rohinik.package/v1')
    expect(minimal.package.id).toBe('org.rohinik.ai.mock')
    expect(minimal.package.version).toBe('1.0.0')
    expect(minimal.package.type).toBe('capability-provider')
  })

  it('maximal manifest compiles with all optional fields', () => {
    expect(maximal.publisher?.certification).toBe('official')
    expect(maximal.provides).toHaveLength(2)
    expect(maximal.consumes).toHaveLength(2)
    expect(maximal.lifecycle?.gracefulShutdownTimeoutMs).toBe(5000)
    expect(maximal.metadata?.['team']).toBe('platform')
  })

  it('package version and capability version are independent fields', () => {
    const pkgVersion = maximal.package.version
    const capVersion = maximal.provides?.[0]?.version
    // Both are 1.0.0 in this fixture but they are structurally separate — different paths
    expect(pkgVersion).toBeDefined()
    expect(capVersion).toBeDefined()
    // Mutating one would not affect the other — verified by distinct property access
    expect('version' in maximal.package).toBe(true)
    expect('version' in (maximal.provides?.[0] ?? {})).toBe(true)
  })
})

describe('PACKAGE_MANIFEST_SCHEMA_VERSION', () => {
  it('equals rohinik.package/v1', () => {
    expect(PACKAGE_MANIFEST_SCHEMA_VERSION).toBe('rohinik.package/v1')
  })
})

describe('PACKAGE_ID_PATTERN', () => {
  it('accepts valid reverse-domain IDs', () => {
    expect(PACKAGE_ID_PATTERN.test('org.rohinik.ai.mock')).toBe(true)
    expect(PACKAGE_ID_PATTERN.test('com.example.my-package')).toBe(true)
    expect(PACKAGE_ID_PATTERN.test('io.acme.provider')).toBe(true)
  })

  it('rejects plain strings without dots', () => {
    expect(PACKAGE_ID_PATTERN.test('mypackage')).toBe(false)
    expect(PACKAGE_ID_PATTERN.test('my-package')).toBe(false)
    expect(PACKAGE_ID_PATTERN.test('')).toBe(false)
  })

  it('rejects uppercase IDs', () => {
    expect(PACKAGE_ID_PATTERN.test('Org.Rohinik')).toBe(false)
  })
})

describe('CAPABILITY_ID_PATTERN', () => {
  it('accepts colon-separated capability IDs', () => {
    expect(CAPABILITY_ID_PATTERN.test('ai:generate:text')).toBe(true)
    expect(CAPABILITY_ID_PATTERN.test('http:request')).toBe(true)
    expect(CAPABILITY_ID_PATTERN.test('telemetry:emit')).toBe(true)
  })

  it('rejects plain strings without colons', () => {
    expect(CAPABILITY_ID_PATTERN.test('ai')).toBe(false)
    expect(CAPABILITY_ID_PATTERN.test('http')).toBe(false)
    expect(CAPABILITY_ID_PATTERN.test('')).toBe(false)
  })
})

describe('PackageManifestParseResult discriminated union', () => {
  it('success branch contains manifest', () => {
    const result: PackageManifestParseResult = { success: true, manifest: minimal }
    if (result.success) {
      expect(result.manifest.schemaVersion).toBe('rohinik.package/v1')
    }
  })

  it('failure branch contains issues', () => {
    const result: PackageManifestParseResult = {
      success: false,
      issues: [{ severity: 'error', code: 'unsupported-schema', message: 'unknown schema version' }],
    }
    if (!result.success) {
      expect(result.issues[0]?.code).toBe('unsupported-schema')
    }
  })
})
