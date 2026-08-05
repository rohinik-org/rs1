import { describe, it, expect } from 'vitest'
import { LockfileValidatorImpl, parseLockfileYaml } from '../parser.js'
import { buildSemanticProjection } from '../semantic-projection.js'
import { semanticHash, auditHash } from '../hasher.js'
import type { RohinikLockfileV1, LockfileAuditMetadata } from '@rohinik-org/lockfile-ir'
import { dump as yamlDump, JSON_SCHEMA } from 'js-yaml'

function makeProjection(): Omit<RohinikLockfileV1, 'semanticHash' | 'audit' | 'auditHash'> {
  return {
    kind: 'rohinik-lockfile',
    lockVersion: 1,
    application: { applicationId: 'app1', manifestSemanticHash: 'msh', manifestSchemaVersion: 1 },
    runtime: { os: 'linux', architecture: 'x64', runtimeKind: 'nodejs', runtimeVersion: '20.0.0' },
    resolution: {
      proposedPlanId: 'plan1',
      proposedPlanSemanticHash: 'psh',
      authorizedPlanSemanticHash: 'apsh',
      authorizationId: 'auth1',
      resolverIdentity: { implementationId: 'res', version: '1.0.0' },
      resolutionPolicySemanticHash: 'rpsh',
      catalogSnapshots: [],
    },
    capabilities: [],
    packages: [],
    dependencies: {},
    models: [],
    infrastructure: [],
    providers: [],
    configuration: [],
    policies: {
      trustPolicySemanticHash: 'tsh',
      permissionPolicySemanticHash: 'ppsh',
      authorizationPolicySemanticHash: 'ash',
    },
  }
}

const AUDIT: LockfileAuditMetadata = {
  generatedAt: '2026-01-01T00:00:00Z',
  generatedBy: { implementationId: 'rohinik-lockfile', version: '0.1.0' },
  provisioningExecutionId: 'exec-1',
  provisioningSemanticJournalHash: 'sjh',
}

function makeValidLockfile(): RohinikLockfileV1 {
  const proj = makeProjection()
  const projection = buildSemanticProjection(proj)
  const sHash = semanticHash(projection)
  const withoutAuditHash = { ...proj, semanticHash: sHash, audit: AUDIT }
  const aHash = auditHash(withoutAuditHash)
  return { ...withoutAuditHash, auditHash: aHash }
}

const validator = new LockfileValidatorImpl()

describe('LockfileValidatorImpl', () => {
  it('parses a valid lockfile', () => {
    const lockfile = makeValidLockfile()
    expect(() => validator.parse(lockfile)).not.toThrow()
  })

  it('rejects unknown lockVersion', () => {
    const raw = { ...makeValidLockfile(), lockVersion: 99 }
    expect(() => validator.parse(raw)).toThrow(/lockVersion/)
  })

  it('rejects wrong kind', () => {
    const raw = { ...makeValidLockfile(), kind: 'something-else' }
    expect(() => validator.parse(raw)).toThrow(/kind/)
  })

  it('rejects duplicate package IDs', () => {
    const lockfile = makeValidLockfile()
    const pkg = {
      packageId: 'pkg-a', version: '1.0.0',
      integrity: { algorithm: 'sha256' as const, encoding: 'hex' as const, value: 'abc123' },
      source: { sourceKind: 'authorized-uri' as const, sourceIdentity: 'u' },
      packageStoreIdentity: {},
    }
    const proj = { ...makeProjection(), packages: [pkg, pkg] }
    const projection = buildSemanticProjection(proj)
    const sHash = semanticHash(projection)
    const withoutAuditHash = { ...proj, semanticHash: sHash, audit: AUDIT }
    const aHash = auditHash(withoutAuditHash)
    const bad = { ...withoutAuditHash, auditHash: aHash }
    const result = validator.validate(bad as unknown as RohinikLockfileV1)
    expect(result.valid).toBe(false)
    expect(result.diagnostics.some(d => d.code === 'DUPLICATE_PACKAGE_ID')).toBe(true)
  })

  it('rejects capability referencing missing provider', () => {
    const proj = makeProjection()
    const projMut = proj as unknown as { capabilities: unknown[] }
    projMut.capabilities = [{
      capabilityId: 'cap1',
      requirement: {},
      resolvedContractVersion: '1',
      providerId: 'non-existent-provider',
      providerVersion: '1',
      packageId: 'pkg1',
      packageVersion: '1',
    }]
    const projection = buildSemanticProjection(proj)
    const sHash = semanticHash(projection)
    const withoutAuditHash = { ...proj, semanticHash: sHash, audit: AUDIT }
    const aHash = auditHash(withoutAuditHash)
    const bad = { ...withoutAuditHash, auditHash: aHash }
    const result = validator.validate(bad as unknown as RohinikLockfileV1)
    expect(result.valid).toBe(false)
    expect(result.diagnostics.some(d => d.code === 'UNKNOWN_PROVIDER_REF')).toBe(true)
  })

  it('rejects invalid semantic hash', () => {
    const lockfile = { ...makeValidLockfile(), semanticHash: 'wrong-hash' as RohinikLockfileV1['semanticHash'] }
    const result = validator.validate(lockfile)
    expect(result.valid).toBe(false)
    expect(result.diagnostics.some(d => d.code === 'SEMANTIC_HASH_MISMATCH')).toBe(true)
  })

  it('rejects invalid audit hash', () => {
    const lockfile = { ...makeValidLockfile(), auditHash: 'wrong-hash' as RohinikLockfileV1['auditHash'] }
    const result = validator.validate(lockfile)
    expect(result.valid).toBe(false)
    expect(result.diagnostics.some(d => d.code === 'AUDIT_HASH_MISMATCH')).toBe(true)
  })
})

describe('parseLockfileYaml', () => {
  it('parses valid YAML', () => {
    const lockfile = makeValidLockfile()
    const yaml = yamlDump(lockfile, { schema: JSON_SCHEMA })
    expect(() => parseLockfileYaml(yaml)).not.toThrow()
  })

  it('throws on invalid YAML', () => {
    expect(() => parseLockfileYaml('{ invalid: yaml: :')).toThrow()
  })

  it('throws on non-object root', () => {
    expect(() => parseLockfileYaml('- a\n- b')).toThrow()
  })
})
