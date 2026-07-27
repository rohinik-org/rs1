import { describe, it, expect } from 'vitest'
import { buildGraph } from '../graph-builder.js'
import type {
  CapabilityResolutionInput,
  CapabilityCatalog,
  CatalogSnapshot,
  CatalogId,
  CatalogSnapshotHash,
  PackageId,
  ProviderCandidateRecord,
  PackageDescriptor,
  ResolutionPolicySnapshot,
  InstalledCapabilitySnapshot,
  InstalledCapabilitySnapshotHash,
  PlatformSnapshot,
  PlatformSnapshotHash,
} from '@rohinik-org/resolution-graph-ir'
import type {
  CapabilityRequirementSet,
  CapabilityRequirementSetId,
  CapabilityRequirementSetHash,
  CapabilityRequirementId,
  IsoTimestamp,
} from '@rohinik-org/capability-contracts-ir'
import type { ApplicationId, CapabilityId } from '@rohinik-org/capability-ir'
import type { ResolutionConfig } from '@rohinik-org/application-manifest-ir'

// ── Test helpers ────────────────────────────────────────────────────────────

const NOW = '2026-07-27T00:00:00.000Z' as IsoTimestamp
const APP_ID = 'com.example.app' as ApplicationId

function makeSnapshot(id: string): CatalogSnapshot {
  return {
    catalogId: id as CatalogId,
    snapshotHash: `hash-${id}` as CatalogSnapshotHash,
    capturedAt: NOW,
  }
}

function emptyDescriptor(packageId: string): PackageDescriptor {
  return {
    packageId: packageId as PackageId,
    version: '1.0.0',
    descriptorHash: 'abc123',
    capabilityDependencies: [],
    packageDependencies: [],
    languageDependencies: [],
    modelDependencies: [],
    infrastructureRequirements: [],
    configurationRequirements: [],
    secretRequirements: [],
    permissionRequirements: [],
    platformRequirements: [],
    conflicts: [],
    replacements: [],
    supportedCycles: [],
  }
}

function makeProviderRecord(overrides: Partial<ProviderCandidateRecord> & { packageId: string; capabilityId: string }): ProviderCandidateRecord {
  return {
    providerId: `provider-${overrides.packageId}`,
    packageId: overrides.packageId as PackageId,
    packageVersion: overrides.packageVersion ?? '1.0.0',
    capabilityId: overrides.capabilityId as CapabilityId,
    capabilityVersion: overrides.capabilityVersion ?? '1.0.0',
    source: overrides.source ?? { kind: 'organization', sourceId: 'test-catalog', artifactId: overrides.packageId },
    descriptorHash: overrides.descriptorHash ?? 'deadbeef',
    trustClaim: overrides.trustClaim ?? {
      level: 'signed',
      claimedBy: { kind: 'catalog', catalogId: 'test-catalog' as CatalogId },
      verificationStatus: 'unverified',
    },
  }
}

function mockCatalog(
  id: string,
  providers: ProviderCandidateRecord[] = [],
  descriptor?: PackageDescriptor,
): CapabilityCatalog {
  return {
    catalogId: id as CatalogId,
    sourceKind: 'organization',
    getSnapshot: async () => makeSnapshot(id),
    findProviders: async (_snap, _capId, _vr) => providers,
    findPackageVersions: async () => [],
    getPackageDescriptor: async (_snap, pkgId, _ver) => {
      if (descriptor && descriptor.packageId === pkgId) return descriptor
      return providers.find(p => p.packageId === pkgId)
        ? emptyDescriptor(pkgId as string)
        : undefined
    },
  }
}

function makePolicy(overrides: Partial<ResolutionPolicySnapshot> = {}): ResolutionPolicySnapshot {
  return {
    policyId: 'test-policy',
    policyVersion: '1.0',
    minimumDeclaredTrustLevel: 'unknown',
    optionalRequirementMode: 'best-effort',
    maximumGraphNodes: 1000,
    maximumDependencyDepth: 5,
    maximumBacktrackingSteps: 100,
    maximumCatalogCandidatesPerRequirement: 10,
    ...overrides,
  }
}

function makeInstalledState(): InstalledCapabilitySnapshot {
  return {
    snapshotHash: 'installed-hash' as InstalledCapabilitySnapshotHash,
    providers: [],
    packages: [],
    languagePackages: [],
    models: [],
    infrastructure: [],
  }
}

function makePlatform(): PlatformSnapshot {
  return {
    snapshotHash: 'platform-hash' as PlatformSnapshotHash,
    os: 'linux',
    arch: 'x64',
    memoryMb: 8192,
    diskMb: 100000,
    features: [],
  }
}

function makeConfig(): ResolutionConfig {
  return {
    allowMarketplace: true,
    allowExternalRegistries: true,
    allowLocalPackages: true,
  }
}

function makeRequirementSet(capabilityId: string, requirementId?: string): CapabilityRequirementSet {
  const reqId = (requirementId ?? `req-${capabilityId}`) as CapabilityRequirementId
  return {
    setId: 'set-1' as CapabilityRequirementSetId,
    semanticHash: 'a'.repeat(64) as CapabilityRequirementSetHash,
    schemaVersion: '1.0',
    applicationId: APP_ID,
    requirements: [
      {
        requirementId: reqId,
        requirementHash: 'b'.repeat(64) as any,
        capabilityId: capabilityId as CapabilityId,
        versionRange: { expression: '^1.0.0', normalized: '^1.0.0' as any },
        necessity: 'required',
        multiplicity: 'single',
        constraints: [],
        preferences: [],
        requestedBy: { direct: { kind: 'application', applicationId: APP_ID }, chain: [] },
      },
    ],
    createdAt: NOW,
  }
}

function makeInput(
  requirementSet: CapabilityRequirementSet,
  catalogs: CapabilityCatalog[],
  policyOverrides: Partial<ResolutionPolicySnapshot> = {},
): CapabilityResolutionInput {
  return {
    requirementSet,
    resolutionConfig: makeConfig(),
    policy: makePolicy(policyOverrides),
    platform: makePlatform(),
    installedState: makeInstalledState(),
    capabilityCatalogs: catalogs,
    languagePackageCatalogs: [],
    modelArtifactCatalogs: [],
  }
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('buildGraph', () => {
  it('single requirement → provider → graph has ≥2 nodes + candidate-for edge', async () => {
    const record = makeProviderRecord({ packageId: 'pkg-a', capabilityId: 'cap.search' })
    const catalog = mockCatalog('cat-1', [record])
    const result = await buildGraph(makeInput(makeRequirementSet('cap.search'), [catalog]))

    expect(result.status).toBe('built')
    if (result.status !== 'built') return

    const { graph } = result
    expect(graph.nodes.length).toBeGreaterThanOrEqual(2)

    const candidateEdge = graph.edges.find(e => e.kind === 'candidate-for')
    expect(candidateEdge).toBeDefined()

    const reqNode = graph.nodes.find(n => n.kind === 'capability-requirement')
    const candNode = graph.nodes.find(n => n.kind === 'capability-provider-candidate')
    expect(reqNode).toBeDefined()
    expect(candNode).toBeDefined()
  })

  it('denyList excludes candidate', async () => {
    const record = makeProviderRecord({ packageId: 'pkg-denied', capabilityId: 'cap.search' })
    const catalog = mockCatalog('cat-1', [record])
    const result = await buildGraph(makeInput(
      makeRequirementSet('cap.search'),
      [catalog],
      { denyList: ['pkg-denied' as PackageId] },
    ))

    expect(result.status).toBe('built')
    if (result.status !== 'built') return

    const { graph } = result
    const denied = graph.nodes.find(n => n.kind === 'capability-provider-candidate' && (n as any).packageId === 'pkg-denied')
    expect(denied).toBeUndefined()
  })

  it('minimumDeclaredTrustLevel filters unsigned candidates', async () => {
    const record = makeProviderRecord({
      packageId: 'pkg-unsigned',
      capabilityId: 'cap.search',
      trustClaim: {
        level: 'unsigned',
        claimedBy: { kind: 'catalog', catalogId: 'cat-1' as CatalogId },
        verificationStatus: 'unverified',
      },
    })
    const catalog = mockCatalog('cat-1', [record])
    const result = await buildGraph(makeInput(
      makeRequirementSet('cap.search'),
      [catalog],
      { minimumDeclaredTrustLevel: 'signed' },
    ))

    expect(result.status).toBe('built')
    if (result.status !== 'built') return

    const { graph } = result
    const candidateNodes = graph.nodes.filter(n => n.kind === 'capability-provider-candidate')
    expect(candidateNodes).toHaveLength(0)
  })

  it('graph.roots contains only requirement node IDs (not candidate IDs)', async () => {
    const record = makeProviderRecord({ packageId: 'pkg-b', capabilityId: 'cap.read' })
    const catalog = mockCatalog('cat-1', [record])
    const result = await buildGraph(makeInput(makeRequirementSet('cap.read'), [catalog]))

    expect(result.status).toBe('built')
    if (result.status !== 'built') return

    const { graph } = result
    const reqNodeIds = new Set(graph.nodes.filter(n => n.kind === 'capability-requirement').map(n => n.nodeId))
    for (const rootId of graph.roots) {
      expect(reqNodeIds.has(rootId)).toBe(true)
    }
    // No candidate nodes appear in roots
    const candNodeIds = new Set(graph.nodes.filter(n => n.kind === 'capability-provider-candidate').map(n => n.nodeId))
    for (const rootId of graph.roots) {
      expect(candNodeIds.has(rootId)).toBe(false)
    }
  })

  it('graph.policy is the exact policy snapshot from input', async () => {
    const catalog = mockCatalog('cat-1', [])
    const policy = makePolicy({ policyId: 'exact-policy', policyVersion: '3.7' })
    const input: CapabilityResolutionInput = {
      ...makeInput(makeRequirementSet('cap.noop'), [catalog]),
      policy,
    }
    const result = await buildGraph(input)

    expect(result.status).toBe('built')
    if (result.status !== 'built') return

    expect(result.graph.policy).toBe(policy)
  })

  it('candidateId is derived by resolver — 64-char hex string', async () => {
    const record = makeProviderRecord({ packageId: 'pkg-c', capabilityId: 'cap.write' })
    const catalog = mockCatalog('cat-1', [record])
    const result = await buildGraph(makeInput(makeRequirementSet('cap.write'), [catalog]))

    expect(result.status).toBe('built')
    if (result.status !== 'built') return

    const candNode = result.graph.nodes.find(n => n.kind === 'capability-provider-candidate') as any
    expect(candNode).toBeDefined()
    // candidateId is SHA-256 hex = 64 chars
    expect(candNode.candidateId).toMatch(/^[a-f0-9]{64}$/)
  })

  it('maximumGraphNodes exceeded → status limit-exceeded', async () => {
    const records = Array.from({ length: 10 }, (_, i) =>
      makeProviderRecord({ packageId: `pkg-${i}` as any, capabilityId: 'cap.bulk' })
    )
    const catalog = mockCatalog('cat-1', records)
    // Allow only 2 nodes (1 req + 0-1 candidates before limit hits)
    const result = await buildGraph(makeInput(
      makeRequirementSet('cap.bulk'),
      [catalog],
      { maximumGraphNodes: 2 },
    ))

    expect(result.status).toBe('built')
    if (result.status !== 'built') return
    expect(result.graph.status).toBe('limit-exceeded')
  })

  it('empty requirementSet → status invalid-input', async () => {
    const emptySet: CapabilityRequirementSet = {
      setId: 'set-empty' as CapabilityRequirementSetId,
      semanticHash: 'c'.repeat(64) as CapabilityRequirementSetHash,
      schemaVersion: '1.0',
      applicationId: APP_ID,
      requirements: [],
      createdAt: NOW,
    }
    const result = await buildGraph({
      requirementSet: emptySet,
      resolutionConfig: makeConfig(),
      policy: makePolicy(),
      platform: makePlatform(),
      installedState: makeInstalledState(),
      capabilityCatalogs: [],
      languagePackageCatalogs: [],
      modelArtifactCatalogs: [],
    })

    expect(result.status).toBe('invalid-input')
    expect(result.diagnostics.some(d => d.code === 'EMPTY_REQUIREMENT_SET')).toBe(true)
  })

  it('two candidates for same requirement → both in graph with candidate-for edges', async () => {
    const records = [
      makeProviderRecord({ packageId: 'pkg-x', capabilityId: 'cap.dual' }),
      makeProviderRecord({ packageId: 'pkg-y', capabilityId: 'cap.dual', trustClaim: {
        level: 'verified',
        claimedBy: { kind: 'catalog', catalogId: 'cat-1' as CatalogId },
        verificationStatus: 'unverified',
      }}),
    ]
    const catalog = mockCatalog('cat-1', records)
    const result = await buildGraph(makeInput(makeRequirementSet('cap.dual'), [catalog]))

    expect(result.status).toBe('built')
    if (result.status !== 'built') return

    const { graph } = result
    const candidateNodes = graph.nodes.filter(n => n.kind === 'capability-provider-candidate')
    expect(candidateNodes.length).toBeGreaterThanOrEqual(2)

    const candForEdges = graph.edges.filter(e => e.kind === 'candidate-for')
    expect(candForEdges.length).toBeGreaterThanOrEqual(2)

    const reqNode = graph.nodes.find(n => n.kind === 'capability-requirement')!
    const allPointToReq = candForEdges.every(e => e.to === reqNode.nodeId)
    expect(allPointToReq).toBe(true)
  })
})
