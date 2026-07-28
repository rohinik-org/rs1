import { describe, it, expect } from 'vitest'
import { buildSemanticProjection } from '../semantic-projection.js'
import { semanticHash } from '../hasher.js'
import type { RohinikLockfileV1 } from '@rohinik-org/lockfile-ir'

function makeMinimalProjectionInput(): Omit<RohinikLockfileV1, 'semanticHash' | 'audit' | 'auditHash'> {
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

describe('buildSemanticProjection', () => {
  it('excludes semanticHash from result', () => {
    const input = makeMinimalProjectionInput()
    const result = buildSemanticProjection(input) as Record<string, unknown>
    expect('semanticHash' in result).toBe(false)
  })

  it('excludes audit from result', () => {
    const input = makeMinimalProjectionInput()
    const result = buildSemanticProjection(input) as Record<string, unknown>
    expect('audit' in result).toBe(false)
  })

  it('excludes auditHash from result', () => {
    const input = makeMinimalProjectionInput()
    const result = buildSemanticProjection(input) as Record<string, unknown>
    expect('auditHash' in result).toBe(false)
  })

  it('sorts capabilities by capabilityId', () => {
    const input = makeMinimalProjectionInput()
    input.capabilities = [
      { capabilityId: 'z-cap', requirement: {}, resolvedContractVersion: '1', providerId: 'p1', providerVersion: '1', packageId: 'pkg1', packageVersion: '1' },
      { capabilityId: 'a-cap', requirement: {}, resolvedContractVersion: '1', providerId: 'p1', providerVersion: '1', packageId: 'pkg1', packageVersion: '1' },
    ] as RohinikLockfileV1['capabilities']
    const result = buildSemanticProjection(input) as { capabilities: Array<{ capabilityId: string }> }
    expect(result.capabilities.map(c => c.capabilityId)).toEqual(['a-cap', 'z-cap'])
  })

  it('sorts packages by packageId then version', () => {
    const input = makeMinimalProjectionInput()
    input.packages = [
      { packageId: 'pkg-b', version: '1.0.0', integrity: { algorithm: 'sha256', encoding: 'hex', value: 'abc' }, source: { sourceKind: 'authorized-uri', sourceIdentity: 'u' }, packageStoreIdentity: {} },
      { packageId: 'pkg-a', version: '2.0.0', integrity: { algorithm: 'sha256', encoding: 'hex', value: 'def' }, source: { sourceKind: 'authorized-uri', sourceIdentity: 'u' }, packageStoreIdentity: {} },
    ] as RohinikLockfileV1['packages']
    const result = buildSemanticProjection(input) as { packages: Array<{ packageId: string }> }
    expect(result.packages.map(p => p.packageId)).toEqual(['pkg-a', 'pkg-b'])
  })

  it('sorts providers by providerId', () => {
    const input = makeMinimalProjectionInput()
    input.providers = [
      { providerId: 'z-prov', version: '1', packageId: 'pkg1', packageVersion: '1', state: 'ready', registryPointer: 'r', capabilityIds: ['b', 'a'], validationEvidence: [] },
      { providerId: 'a-prov', version: '1', packageId: 'pkg1', packageVersion: '1', state: 'ready', registryPointer: 'r', capabilityIds: [], validationEvidence: [] },
    ] as RohinikLockfileV1['providers']
    const result = buildSemanticProjection(input) as { providers: Array<{ providerId: string; capabilityIds: string[] }> }
    expect(result.providers.map(p => p.providerId)).toEqual(['a-prov', 'z-prov'])
  })

  it('sorts capabilityIds within a provider', () => {
    const input = makeMinimalProjectionInput()
    input.providers = [
      { providerId: 'p1', version: '1', packageId: 'pkg1', packageVersion: '1', state: 'ready', registryPointer: 'r', capabilityIds: ['z-cap', 'a-cap'], validationEvidence: [] },
    ] as RohinikLockfileV1['providers']
    const result = buildSemanticProjection(input) as { providers: Array<{ capabilityIds: string[] }> }
    expect(result.providers[0]!.capabilityIds).toEqual(['a-cap', 'z-cap'])
  })

  it('sorts catalog snapshots by catalogId', () => {
    const input = makeMinimalProjectionInput()
    input.resolution = {
      ...input.resolution,
      catalogSnapshots: [
        { catalogId: 'z-cat', snapshotSemanticHash: 's1' },
        { catalogId: 'a-cat', snapshotSemanticHash: 's2' },
      ],
    }
    const result = buildSemanticProjection(input) as { resolution: { catalogSnapshots: Array<{ catalogId: string }> } }
    expect(result.resolution.catalogSnapshots.map(c => c.catalogId)).toEqual(['a-cat', 'z-cat'])
  })

  it('same hash regardless of insertion order', () => {
    const input1 = makeMinimalProjectionInput()
    input1.capabilities = [
      { capabilityId: 'z', requirement: {}, resolvedContractVersion: '1', providerId: 'p', providerVersion: '1', packageId: 'pkg', packageVersion: '1' },
      { capabilityId: 'a', requirement: {}, resolvedContractVersion: '1', providerId: 'p', providerVersion: '1', packageId: 'pkg', packageVersion: '1' },
    ] as RohinikLockfileV1['capabilities']

    const input2 = makeMinimalProjectionInput()
    input2.capabilities = [
      { capabilityId: 'a', requirement: {}, resolvedContractVersion: '1', providerId: 'p', providerVersion: '1', packageId: 'pkg', packageVersion: '1' },
      { capabilityId: 'z', requirement: {}, resolvedContractVersion: '1', providerId: 'p', providerVersion: '1', packageId: 'pkg', packageVersion: '1' },
    ] as RohinikLockfileV1['capabilities']

    expect(semanticHash(buildSemanticProjection(input1))).toBe(semanticHash(buildSemanticProjection(input2)))
  })
})
