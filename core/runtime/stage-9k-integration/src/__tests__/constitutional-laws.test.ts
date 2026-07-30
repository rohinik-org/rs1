import { describe, it, expect } from 'vitest'
import { parsePackageManifest } from '@rohinik-org/package-manifest'
import type { RohinikPackageManifestV1 } from '@rohinik-org/package-manifest-ir'
import { buildEngine as engine } from './fixtures.js'

const AT = '2026-07-30T00:00:00.000Z'

// Minimal valid manifest used as baseline for positive cases
const BASE: RohinikPackageManifestV1 = {
  schemaVersion: 'rohinik.package/v1',
  package: {
    id: 'org.rohinik.ai.mock',
    name: 'Rohinik Mock Package',
    version: '1.0.0',
    type: 'capability-provider',
  },
  publisher: { id: 'org.rohinik', certification: 'official' },
  provides: [{ capability: 'rohinik:mock:echo', version: '1.0.0' }],
}

// ─── L-9K-001: Manifest Completeness ─────────────────────────────────────────

describe('L-9K-001: Manifest Completeness', () => {
  it('L-9K-001: Manifest Completeness — positive: valid complete manifest passes', async () => {
    const result = await engine().run({ mode: 'source', payload: BASE }, AT)
    expect(result.outcome).toBe('passed')
  })

  it('L-9K-001: Manifest Completeness — negative: missing package.id fails', async () => {
    const bad = {
      ...BASE,
      package: { ...BASE.package, id: '' },
    }
    const result = await engine().run({ mode: 'source', payload: bad }, AT)
    // The manifest rule or isolation rule will catch empty/invalid id
    expect(['failed', 'blocked']).toContain(result.outcome)
  })

  it('L-9K-001: Manifest Completeness — negative: missing package.version fails parse', () => {
    const yaml = `
schemaVersion: rohinik.package/v1
package:
  id: org.rohinik.ai.mock
  name: Test
  type: capability-provider
publisher:
  id: org.rohinik
  certification: official
`
    const result = parsePackageManifest(yaml)
    // version is required by parser
    expect(result.success).toBe(false)
  })
})

// ─── L-9K-002: Lifecycle Conformance ─────────────────────────────────────────

describe('L-9K-002: Lifecycle Conformance', () => {
  it('L-9K-002: Lifecycle Conformance — positive: valid lifecycle passes', async () => {
    const manifest: RohinikPackageManifestV1 = {
      ...BASE,
      lifecycle: { idempotentShutdown: true, gracefulShutdownTimeoutMs: 5000 },
    }
    const result = await engine().run({ mode: 'source', payload: manifest }, AT)
    expect(result.outcome).toBe('passed')
  })

  it('L-9K-002: Lifecycle Conformance — negative: negative gracefulShutdownTimeoutMs fails', async () => {
    const manifest = {
      ...BASE,
      lifecycle: { gracefulShutdownTimeoutMs: -1 },
    }
    const result = await engine().run({ mode: 'source', payload: manifest }, AT)
    expect(result.outcome).toBe('failed')
    expect(result.issues.some(i => i.path === 'lifecycle.gracefulShutdownTimeoutMs')).toBe(true)
  })

  it('L-9K-002: Lifecycle Conformance — negative: non-integer gracefulShutdownTimeoutMs fails', async () => {
    const manifest = {
      ...BASE,
      lifecycle: { gracefulShutdownTimeoutMs: 1.5 },
    }
    const result = await engine().run({ mode: 'source', payload: manifest }, AT)
    expect(result.outcome).toBe('failed')
  })

  it('L-9K-002: Lifecycle Conformance — negative: zero gracefulShutdownTimeoutMs fails', async () => {
    const manifest = {
      ...BASE,
      lifecycle: { gracefulShutdownTimeoutMs: 0 },
    }
    const result = await engine().run({ mode: 'source', payload: manifest }, AT)
    expect(result.outcome).toBe('failed')
  })
})

// ─── L-9K-003: Capability Version Independence ───────────────────────────────

describe('L-9K-003: Capability Version Independence', () => {
  it('L-9K-003: Capability Version Independence — positive: capability version differs from package version', async () => {
    const manifest: RohinikPackageManifestV1 = {
      ...BASE,
      package: { ...BASE.package, version: '2.0.0' },
      provides: [{ capability: 'rohinik:mock:echo', version: '1.0.0' }],
    }
    const result = await engine().run({ mode: 'source', payload: manifest }, AT)
    expect(result.outcome).toBe('passed')
  })

  it('L-9K-003: Capability Version Independence — positive: multiple capabilities with independent versions', async () => {
    const manifest: RohinikPackageManifestV1 = {
      ...BASE,
      package: { ...BASE.package, version: '3.5.0' },
      provides: [
        { capability: 'rohinik:mock:echo', version: '1.0.0' },
        { capability: 'rohinik:mock:ping', version: '2.1.0' },
      ],
    }
    const result = await engine().run({ mode: 'source', payload: manifest }, AT)
    expect(result.outcome).toBe('passed')
  })

  it('L-9K-003: Capability Version Independence — negative: invalid capability id format fails', async () => {
    const manifest = {
      ...BASE,
      provides: [{ capability: 'INVALID_FORMAT', version: '1.0.0' }],
    }
    const result = await engine().run({ mode: 'source', payload: manifest }, AT)
    expect(result.outcome).toBe('failed')
    expect(result.issues.some(i => i.ruleId === '9k-capability-version-independence')).toBe(true)
  })
})

// ─── L-9K-004: No Hidden Dependency ──────────────────────────────────────────

describe('L-9K-004: No Hidden Dependency', () => {
  it('L-9K-004: No Hidden Dependency — positive: valid rohinik dep ids declared', async () => {
    const manifest: RohinikPackageManifestV1 = {
      ...BASE,
      dependencies: { rohinik: ['org.rohinik.knowledge.core'] },
    }
    const result = await engine().run({ mode: 'source', payload: manifest }, AT)
    expect(result.outcome).toBe('passed')
  })

  it('L-9K-004: No Hidden Dependency — negative: invalid rohinik dep id fails', async () => {
    const manifest = {
      ...BASE,
      dependencies: { rohinik: ['INVALID_DEP_ID'] },
    }
    const result = await engine().run({ mode: 'source', payload: manifest }, AT)
    expect(result.outcome).toBe('failed')
    expect(result.issues.some(i => i.ruleId === '9k-dependency-declarations')).toBe(true)
  })

  it('L-9K-004: No Hidden Dependency — negative: empty npm dep name fails', async () => {
    const manifest = {
      ...BASE,
      dependencies: { npm: [{ name: '', version: '1.0.0' }] },
    }
    const result = await engine().run({ mode: 'source', payload: manifest }, AT)
    expect(result.outcome).toBe('failed')
    expect(result.issues.some(i => i.ruleId === '9k-dependency-declarations')).toBe(true)
  })
})

// ─── L-9K-005: Package Isolation ─────────────────────────────────────────────

describe('L-9K-005: Package Isolation', () => {
  it('L-9K-005: Package Isolation — positive: valid package id passes isolation check', async () => {
    const result = await engine().run({ mode: 'source', payload: BASE }, AT)
    expect(result.outcome).toBe('passed')
    const isolationResult = result.ruleResults.find(r => r.ruleId === '9k-package-isolation')
    expect(isolationResult?.outcome).toBe('passed')
  })

  it('L-9K-005: Package Isolation — negative: invalid package id format fails', async () => {
    const manifest = {
      ...BASE,
      package: { ...BASE.package, id: 'INVALID_ID' },
    }
    const result = await engine().run({ mode: 'source', payload: manifest }, AT)
    expect(result.outcome).toBe('failed')
    expect(result.issues.some(i => i.ruleId === '9k-package-isolation')).toBe(true)
  })

  it('L-9K-005: Package Isolation — negative: empty package id fails', async () => {
    const manifest = {
      ...BASE,
      package: { ...BASE.package, id: '' },
    }
    const result = await engine().run({ mode: 'source', payload: manifest }, AT)
    expect(result.outcome).toBe('failed')
  })
})
