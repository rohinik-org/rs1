import { describe, it, expect } from 'vitest'
import { ConformanceEngine } from '../conformance-engine.js'
import { createDefaultRuleSet } from '../rules/index.js'
import type { ConformanceSubject } from '../conformance-engine.js'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const RAN_AT = '2026-07-30T00:00:00.000Z'

function subject(payload: unknown): ConformanceSubject {
  return { mode: 'source', payload }
}

// Minimal valid manifest — passes all rules
const VALID_MANIFEST = {
  schemaVersion: 'rohinik.package/v1',
  package: {
    id: 'com.example.my-package',
    name: 'my-package',
    version: '1.0.0',
    type: 'adapter',
  },
}

function run(payload: unknown) {
  const engine = new ConformanceEngine(createDefaultRuleSet())
  return engine.run(subject(payload), RAN_AT)
}

function ruleOutcome(result: Awaited<ReturnType<typeof run>>, ruleId: string) {
  return result.ruleResults.find(r => r.ruleId === ruleId)?.outcome
}

// ─── L-9K-001: Manifest Completeness ─────────────────────────────────────────

describe('L-9K-001 manifest-completeness', () => {
  it('passes for a valid minimal manifest', async () => {
    const result = await run(VALID_MANIFEST)
    expect(ruleOutcome(result, '9k-manifest-completeness')).toBe('passed')
  })

  it('fails when schemaVersion is wrong', async () => {
    const result = await run({ ...VALID_MANIFEST, schemaVersion: 'wrong' })
    expect(ruleOutcome(result, '9k-manifest-completeness')).toBe('failed')
  })

  it('fails when package section is missing', async () => {
    const { package: _pkg, ...rest } = VALID_MANIFEST
    const result = await run({ ...rest })
    expect(ruleOutcome(result, '9k-manifest-completeness')).toBe('failed')
  })

  it('fails when required package fields are missing', async () => {
    const result = await run({
      schemaVersion: 'rohinik.package/v1',
      package: { id: 'com.example.pkg' }, // missing name, version, type
    })
    expect(ruleOutcome(result, '9k-manifest-completeness')).toBe('failed')
  })

  it('warns on unknown top-level keys', async () => {
    const result = await run({ ...VALID_MANIFEST, unknownKey: 'value' })
    expect(ruleOutcome(result, '9k-manifest-completeness')).toBe('warned')
  })
})

// ─── L-9K-003: Capability Version Independence ────────────────────────────────

describe('L-9K-003 capability-version-independence', () => {
  it('passes for valid capability declarations', async () => {
    const result = await run({
      ...VALID_MANIFEST,
      provides: [{ capability: 'data:read', version: '1.0.0' }],
      consumes: [{ capability: 'auth:token', versionRange: '^1.0.0' }],
    })
    expect(ruleOutcome(result, '9k-capability-version-independence')).toBe('passed')
  })

  it('fails when capability id does not match pattern', async () => {
    const result = await run({
      ...VALID_MANIFEST,
      provides: [{ capability: 'INVALID_ID', version: '1.0.0' }],
    })
    expect(ruleOutcome(result, '9k-capability-version-independence')).toBe('failed')
  })

  it('fails when capability version is not semver', async () => {
    const result = await run({
      ...VALID_MANIFEST,
      provides: [{ capability: 'data:read', version: 'not-semver' }],
    })
    expect(ruleOutcome(result, '9k-capability-version-independence')).toBe('failed')
  })

  it('fails on duplicate provided capability', async () => {
    const result = await run({
      ...VALID_MANIFEST,
      provides: [
        { capability: 'data:read', version: '1.0.0' },
        { capability: 'data:read', version: '2.0.0' },
      ],
    })
    expect(ruleOutcome(result, '9k-capability-version-independence')).toBe('failed')
  })

  it('fails on duplicate consumed capability', async () => {
    const result = await run({
      ...VALID_MANIFEST,
      consumes: [
        { capability: 'auth:token', versionRange: '^1.0.0' },
        { capability: 'auth:token', versionRange: '^2.0.0' },
      ],
    })
    expect(ruleOutcome(result, '9k-capability-version-independence')).toBe('failed')
  })
})

// ─── L-9K-002: Lifecycle Conformance ─────────────────────────────────────────

describe('L-9K-002 lifecycle-conformance', () => {
  it('passes when no lifecycle declared', async () => {
    const result = await run(VALID_MANIFEST)
    expect(ruleOutcome(result, '9k-lifecycle-conformance')).toBe('passed')
  })

  it('passes when gracefulShutdownTimeoutMs is a positive integer', async () => {
    const result = await run({ ...VALID_MANIFEST, lifecycle: { gracefulShutdownTimeoutMs: 5000 } })
    expect(ruleOutcome(result, '9k-lifecycle-conformance')).toBe('passed')
  })

  it('fails when gracefulShutdownTimeoutMs is zero', async () => {
    const result = await run({ ...VALID_MANIFEST, lifecycle: { gracefulShutdownTimeoutMs: 0 } })
    expect(ruleOutcome(result, '9k-lifecycle-conformance')).toBe('failed')
  })

  it('fails when gracefulShutdownTimeoutMs is negative', async () => {
    const result = await run({ ...VALID_MANIFEST, lifecycle: { gracefulShutdownTimeoutMs: -1 } })
    expect(ruleOutcome(result, '9k-lifecycle-conformance')).toBe('failed')
  })

  it('fails when gracefulShutdownTimeoutMs is a float', async () => {
    const result = await run({ ...VALID_MANIFEST, lifecycle: { gracefulShutdownTimeoutMs: 1.5 } })
    expect(ruleOutcome(result, '9k-lifecycle-conformance')).toBe('failed')
  })

  it('invalid lifecycle prevents passing (L-9K-002 named)', async () => {
    const result = await run({ ...VALID_MANIFEST, lifecycle: { gracefulShutdownTimeoutMs: -100 } })
    const r = result.ruleResults.find(r => r.ruleId === '9k-lifecycle-conformance')!
    expect(r.outcome).toBe('failed')
    expect(r.issues.length).toBeGreaterThan(0)
  })
})

// ─── L-9K-004: No Hidden Dependency ──────────────────────────────────────────

describe('L-9K-004 dependency-declarations', () => {
  it('passes for valid dependency declarations', async () => {
    const result = await run({
      ...VALID_MANIFEST,
      dependencies: {
        rohinik: ['com.example.other-pkg'],
        npm: [{ name: 'express', version: '^4.0.0' }],
      },
    })
    expect(ruleOutcome(result, '9k-dependency-declarations')).toBe('passed')
  })

  it('fails when rohinik dep id does not match PACKAGE_ID_PATTERN (L-9K-004 named)', async () => {
    const result = await run({
      ...VALID_MANIFEST,
      dependencies: { rohinik: ['INVALID_ID'] },
    })
    expect(ruleOutcome(result, '9k-dependency-declarations')).toBe('failed')
    const issues = result.ruleResults.find(r => r.ruleId === '9k-dependency-declarations')!.issues
    expect(issues.some(i => i.message.includes('INVALID_ID'))).toBe(true)
  })

  it('fails when npm dependency name is empty (hidden npm dep detected)', async () => {
    const result = await run({
      ...VALID_MANIFEST,
      dependencies: { npm: [{ name: '', version: '1.0.0' }] },
    })
    expect(ruleOutcome(result, '9k-dependency-declarations')).toBe('failed')
  })
})

// ─── L-9K-005: Package Isolation ─────────────────────────────────────────────

describe('L-9K-005 package-isolation', () => {
  it('passes when package id matches PACKAGE_ID_PATTERN', async () => {
    const result = await run(VALID_MANIFEST)
    expect(ruleOutcome(result, '9k-package-isolation')).toBe('passed')
  })

  it('fails when package id is invalid (raw protected-resource access / L-9K-005 named)', async () => {
    const result = await run({
      ...VALID_MANIFEST,
      package: { ...VALID_MANIFEST.package, id: 'INVALID' },
    })
    expect(ruleOutcome(result, '9k-package-isolation')).toBe('failed')
    const issues = result.ruleResults.find(r => r.ruleId === '9k-package-isolation')!.issues
    expect(issues.length).toBeGreaterThan(0)
  })

  it('permission rule passes for valid network permissions', async () => {
    const result = await run({
      ...VALID_MANIFEST,
      permissions: {
        network: {
          outbound: [{ host: 'api.example.com', protocols: ['https'] }],
        },
      },
    })
    expect(ruleOutcome(result, '9k-permission-declarations')).toBe('passed')
  })

  it('permission rule fails for empty host (undeclared external access)', async () => {
    const result = await run({
      ...VALID_MANIFEST,
      permissions: {
        network: { outbound: [{ host: '', protocols: ['https'] }] },
      },
    })
    expect(ruleOutcome(result, '9k-permission-declarations')).toBe('failed')
  })

  it('permission rule fails for duplicate outbound host', async () => {
    const result = await run({
      ...VALID_MANIFEST,
      permissions: {
        network: {
          outbound: [
            { host: 'api.example.com', protocols: ['https'] },
            { host: 'api.example.com', protocols: ['http'] },
          ],
        },
      },
    })
    expect(ruleOutcome(result, '9k-permission-declarations')).toBe('failed')
  })
})

// ─── Provider consistency ─────────────────────────────────────────────────────

describe('provider-consistency', () => {
  it('fails when capability-provider has no provides', async () => {
    const result = await run({
      ...VALID_MANIFEST,
      package: { ...VALID_MANIFEST.package, type: 'capability-provider' },
    })
    expect(ruleOutcome(result, '9k-provider-consistency')).toBe('failed')
  })

  it('passes when capability-provider has at least one provided capability', async () => {
    const result = await run({
      ...VALID_MANIFEST,
      package: { ...VALID_MANIFEST.package, type: 'capability-provider' },
      provides: [{ capability: 'data:read', version: '1.0.0' }],
    })
    expect(ruleOutcome(result, '9k-provider-consistency')).toBe('passed')
  })

  it('passes for adapter type without provides', async () => {
    const result = await run(VALID_MANIFEST)
    expect(ruleOutcome(result, '9k-provider-consistency')).toBe('passed')
  })
})

// ─── Configuration ────────────────────────────────────────────────────────────

describe('configuration-declarations', () => {
  it('passes for valid configuration', async () => {
    const result = await run({
      ...VALID_MANIFEST,
      configuration: {
        secrets: [{ name: 'API_KEY', required: true }],
        environment: [{ name: 'PORT', required: false, default: '8080' }],
      },
    })
    expect(ruleOutcome(result, '9k-configuration-declarations')).toBe('passed')
  })

  it('fails when secret name is empty', async () => {
    const result = await run({
      ...VALID_MANIFEST,
      configuration: { secrets: [{ name: '', required: true }] },
    })
    expect(ruleOutcome(result, '9k-configuration-declarations')).toBe('failed')
  })

  it('fails when secret has a default field', async () => {
    const result = await run({
      ...VALID_MANIFEST,
      configuration: { secrets: [{ name: 'API_KEY', required: false, default: 'secret123' }] },
    })
    expect(ruleOutcome(result, '9k-configuration-declarations')).toBe('failed')
  })

  it('fails when env var name is empty', async () => {
    const result = await run({
      ...VALID_MANIFEST,
      configuration: { environment: [{ name: '', required: false }] },
    })
    expect(ruleOutcome(result, '9k-configuration-declarations')).toBe('failed')
  })
})

// ─── Readiness and idempotent shutdown ───────────────────────────────────────

describe('readiness-declaration', () => {
  it('passes when no health declared', async () => {
    const result = await run(VALID_MANIFEST)
    expect(ruleOutcome(result, '9k-readiness-declaration')).toBe('passed')
  })

  it('passes when health.readiness is a non-empty string', async () => {
    const result = await run({ ...VALID_MANIFEST, health: { readiness: '/health/ready' } })
    expect(ruleOutcome(result, '9k-readiness-declaration')).toBe('passed')
  })

  it('fails when health.readiness is an empty string (readiness validation)', async () => {
    const result = await run({ ...VALID_MANIFEST, health: { readiness: '' } })
    expect(ruleOutcome(result, '9k-readiness-declaration')).toBe('failed')
  })
})

describe('shutdown-declaration', () => {
  it('passes when no lifecycle declared', async () => {
    const result = await run(VALID_MANIFEST)
    expect(ruleOutcome(result, '9k-shutdown-declaration')).toBe('passed')
  })

  it('passes when idempotentShutdown is boolean true (idempotent shutdown validation)', async () => {
    const result = await run({ ...VALID_MANIFEST, lifecycle: { idempotentShutdown: true } })
    expect(ruleOutcome(result, '9k-shutdown-declaration')).toBe('passed')
  })

  it('passes when idempotentShutdown is boolean false', async () => {
    const result = await run({ ...VALID_MANIFEST, lifecycle: { idempotentShutdown: false } })
    expect(ruleOutcome(result, '9k-shutdown-declaration')).toBe('passed')
  })

  it('fails when idempotentShutdown is not boolean', async () => {
    const result = await run({ ...VALID_MANIFEST, lifecycle: { idempotentShutdown: 'yes' as unknown as boolean } })
    expect(ruleOutcome(result, '9k-shutdown-declaration')).toBe('failed')
  })
})

// ─── Failure detection (missing required secret) ──────────────────────────────

describe('failure-detection', () => {
  it('passes when all required secrets have names', async () => {
    const result = await run({
      ...VALID_MANIFEST,
      configuration: { secrets: [{ name: 'API_KEY', required: true }] },
    })
    expect(ruleOutcome(result, '9k-failure-detection')).toBe('passed')
  })

  it('warns (not hard-fails) when required secret has empty name', async () => {
    const result = await run({
      ...VALID_MANIFEST,
      configuration: { secrets: [{ name: '', required: true }] },
    })
    // Must be warned, not failed — graceful degradation
    expect(ruleOutcome(result, '9k-failure-detection')).toBe('warned')
    const r = result.ruleResults.find(r => r.ruleId === '9k-failure-detection')!
    expect(r.issues[0]?.severity).toBe('warning')
  })
})

// ─── Deterministic metadata ───────────────────────────────────────────────────

describe('deterministic-metadata', () => {
  it('passes when all metadata values are strings', async () => {
    const result = await run({ ...VALID_MANIFEST, metadata: { author: 'Alice', version: '1' } })
    expect(ruleOutcome(result, '9k-deterministic-metadata')).toBe('passed')
  })

  it('passes when no metadata declared', async () => {
    const result = await run(VALID_MANIFEST)
    expect(ruleOutcome(result, '9k-deterministic-metadata')).toBe('passed')
  })

  it('fails when metadata contains a non-string value (object)', async () => {
    const result = await run({
      ...VALID_MANIFEST,
      metadata: { tags: ['a', 'b'] as unknown as string },
    })
    expect(ruleOutcome(result, '9k-deterministic-metadata')).toBe('failed')
  })

  it('fails when metadata contains a number', async () => {
    const result = await run({
      ...VALID_MANIFEST,
      metadata: { count: 42 as unknown as string },
    })
    expect(ruleOutcome(result, '9k-deterministic-metadata')).toBe('failed')
  })
})

// ─── createDefaultRuleSet registers all 12 rules ─────────────────────────────

describe('createDefaultRuleSet', () => {
  it('registers exactly 12 rules', () => {
    const registry = createDefaultRuleSet()
    expect(registry.list()).toHaveLength(12)
  })

  it('all registered rule ids are the expected 9k- ids', () => {
    const expectedIds = [
      '9k-manifest-completeness',
      '9k-capability-version-independence',
      '9k-provider-consistency',
      '9k-lifecycle-conformance',
      '9k-dependency-declarations',
      '9k-permission-declarations',
      '9k-configuration-declarations',
      '9k-readiness-declaration',
      '9k-shutdown-declaration',
      '9k-failure-detection',
      '9k-package-isolation',
      '9k-deterministic-metadata',
    ]
    const registry = createDefaultRuleSet()
    const ids = registry.list().map(r => r.ruleId)
    expect(ids).toEqual(expectedIds)
  })

  it('valid manifest passes all rules end-to-end', async () => {
    const result = await run(VALID_MANIFEST)
    expect(result.outcome).toBe('passed')
  })
})
