import { describe, it, expect } from 'vitest'
import { LockfileGeneratorImpl } from '../generator.js'
import type { DeliveredEnvironmentSnapshot, LockfileAuditMetadata } from '@rohinik-org/lockfile-ir'

const AUDIT: LockfileAuditMetadata = {
  generatedAt: '2026-01-01T00:00:00Z',
  generatedBy: { implementationId: 'rohinik-lockfile', version: '0.1.0' },
  provisioningExecutionId: 'exec-1',
  provisioningSemanticJournalHash: 'sjh',
}

function makeSnapshot(overrides: Partial<DeliveredEnvironmentSnapshot> = {}): DeliveredEnvironmentSnapshot {
  return {
    kind: 'delivered-environment-snapshot',
    snapshotVersion: 1,
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
    provisioningEvidence: {
      executionId: 'exec-1',
      status: 'success',
      semanticJournalHash: 'sjh',
    },
    ...overrides,
  }
}

const generator = new LockfileGeneratorImpl()

describe('LockfileGeneratorImpl', () => {
  it('generates a valid lockfile', () => {
    const snapshot = makeSnapshot()
    expect(() => generator.generate(snapshot, AUDIT)).not.toThrow()
  })

  it('same snapshot different execution IDs → same semantic hash', () => {
    const s1 = makeSnapshot({ provisioningEvidence: { executionId: 'exec-1', status: 'success', semanticJournalHash: 'sjh' } })
    const s2 = makeSnapshot({ provisioningEvidence: { executionId: 'exec-2', status: 'success', semanticJournalHash: 'sjh' } })
    const audit1 = { ...AUDIT, provisioningExecutionId: 'exec-1' }
    const audit2 = { ...AUDIT, provisioningExecutionId: 'exec-2' }
    const l1 = generator.generate(s1, audit1)
    const l2 = generator.generate(s2, audit2)
    expect(l1.semanticHash).toBe(l2.semanticHash)
  })

  it('same snapshot different timestamps → same semantic hash', () => {
    const snapshot = makeSnapshot()
    const audit1 = { ...AUDIT, generatedAt: '2026-01-01T00:00:00Z' }
    const audit2 = { ...AUDIT, generatedAt: '2026-06-01T12:00:00Z' }
    const l1 = generator.generate(snapshot, audit1)
    const l2 = generator.generate(snapshot, audit2)
    expect(l1.semanticHash).toBe(l2.semanticHash)
  })

  it('different insertion order → same semantic hash', () => {
    // Use capabilities with empty providerId so validation passes (no provider ref check for empty)
    const cap = (id: string) => ({
      capabilityId: id, requirement: {}, resolvedContractVersion: '1',
      providerId: '', providerVersion: '1', packageId: 'pkg', packageVersion: '1',
    } as DeliveredEnvironmentSnapshot['capabilities'][0])

    const s1 = makeSnapshot({ capabilities: [cap('z'), cap('a')] })
    const s2 = makeSnapshot({ capabilities: [cap('a'), cap('z')] })
    const l1 = generator.generate(s1, AUDIT)
    const l2 = generator.generate(s2, AUDIT)
    expect(l1.semanticHash).toBe(l2.semanticHash)
  })

  it('generator.generate returns a lockfile without writing to disk', () => {
    const snapshot = makeSnapshot()
    const lockfile = generator.generate(snapshot, AUDIT)
    // LockfileGeneratorImpl has no file system access — check it's an in-memory object
    expect(lockfile.kind).toBe('rohinik-lockfile')
    expect(typeof lockfile.semanticHash).toBe('string')
    expect(typeof lockfile.auditHash).toBe('string')
  })

  it('different snapshots produce different semantic hashes', () => {
    const s1 = makeSnapshot({ application: { applicationId: 'app1', manifestSemanticHash: 'msh1', manifestSchemaVersion: 1 } })
    const s2 = makeSnapshot({ application: { applicationId: 'app2', manifestSemanticHash: 'msh2', manifestSchemaVersion: 1 } })
    const l1 = generator.generate(s1, AUDIT)
    const l2 = generator.generate(s2, AUDIT)
    expect(l1.semanticHash).not.toBe(l2.semanticHash)
  })

  it('throws on non-success snapshot', () => {
    const snapshot = makeSnapshot({
      provisioningEvidence: { executionId: 'e', status: 'success', semanticJournalHash: '' },
    })
    // Force status to not-success by overriding the field
    const bad = { ...snapshot, provisioningEvidence: { ...snapshot.provisioningEvidence, status: 'failed' as 'success' } }
    expect(() => generator.generate(bad, AUDIT)).toThrow()
  })
})
