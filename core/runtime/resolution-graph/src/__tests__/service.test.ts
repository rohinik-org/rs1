import { describe, it, expect, vi } from 'vitest'
import { createCapabilityResolutionService } from '../service.js'
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

// ── Helpers (same pattern as graph-builder.test.ts / solver.test.ts) ──────────

const NOW = '2026-07-27T00:00:00.000Z' as IsoTimestamp
const APP_ID = 'com.example.app' as ApplicationId

function makeSnapshot(id: string): CatalogSnapshot {
  return { catalogId: id as CatalogId, snapshotHash: `hash-${id}` as CatalogSnapshotHash, capturedAt: NOW }
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

function makeProviderRecord(overrides: { packageId: string; capabilityId: string; packageVersion?: string; capabilityVersion?: string; source?: ProviderCandidateRecord['source']; descriptorHash?: string; trustClaim?: ProviderCandidateRecord['trustClaim'] }): ProviderCandidateRecord {
  return {
    providerId: `provider-${overrides.packageId}`,
    packageId: overrides.packageId as PackageId,
    packageVersion: overrides.packageVersion ?? '1.0.0',
    capabilityId: overrides.capabilityId as CapabilityId,
    capabilityVersion: overrides.capabilityVersion ?? '1.0.0',
    source: overrides.source ?? { kind: 'organization', sourceId: 'test-catalog', artifactId: overrides.packageId },
    descriptorHash: 'deadbeef',
    trustClaim: overrides.trustClaim ?? {
      level: 'signed',
      claimedBy: { kind: 'catalog', catalogId: 'test-catalog' as CatalogId },
      verificationStatus: 'unverified',
    },
  }
}

function mockCatalog(id: string, providers: ProviderCandidateRecord[]): CapabilityCatalog {
  return {
    catalogId: id as CatalogId,
    sourceKind: 'organization',
    getSnapshot: async () => makeSnapshot(id),
    findProviders: async (_snap, _capId, _vr) => providers,
    findPackageVersions: async () => [],
    getPackageDescriptor: async (_snap, pkgId, _ver) =>
      providers.find(p => p.packageId === pkgId) ? emptyDescriptor(pkgId as string) : undefined,
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
  return { allowMarketplace: true, allowExternalRegistries: true, allowLocalPackages: true }
}

function makeRequirementSet(capabilityId: string): CapabilityRequirementSet {
  return {
    setId: 'set-1' as CapabilityRequirementSetId,
    semanticHash: 'a'.repeat(64) as CapabilityRequirementSetHash,
    schemaVersion: '1.0',
    applicationId: APP_ID,
    requirements: [
      {
        requirementId: `req-${capabilityId}` as CapabilityRequirementId,
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

// ── Tests ────────────────────────────────────────────────────────────────────

describe('createCapabilityResolutionService — integration', () => {
  it('happy path: buildGraph → solve → plan.status is proposed', async () => {
    const svc = createCapabilityResolutionService()
    const record = makeProviderRecord({ packageId: 'pkg-a', capabilityId: 'cap.search' })
    const input = makeInput(makeRequirementSet('cap.search'), [mockCatalog('cat-1', [record])])
    const result = await svc.buildGraph(input)
    expect(result.status).toBe('built')
    if (result.status !== 'built') return
    const plan = await svc.solve(result.graph)
    expect(plan.status).toBe('proposed')
    expect(plan.unresolvedRequirements).toHaveLength(0)
    expect(plan.limitFailures).toHaveLength(0)
  })

  it('happy path: selectedProviders and packagesToInstall and installationOrder are correct', async () => {
    const svc = createCapabilityResolutionService()
    const record = makeProviderRecord({ packageId: 'pkg-install', capabilityId: 'cap.read' })
    const input = makeInput(makeRequirementSet('cap.read'), [mockCatalog('cat-1', [record])])
    const result = await svc.buildGraph(input)
    expect(result.status).toBe('built')
    if (result.status !== 'built') return
    const plan = await svc.solve(result.graph)
    expect(plan.selectedProviders).toHaveLength(1)
    expect(plan.selectedProviders[0]?.packageId).toBe('pkg-install')
    expect(plan.packagesToInstall.length).toBeGreaterThanOrEqual(1)
    expect(plan.packagesToInstall.find(p => p.packageId === 'pkg-install')).toBeDefined()
    expect(plan.installationOrder.length).toBeGreaterThanOrEqual(1)
  })

  it('multi-catalog: candidates from both catalogs appear in graph', async () => {
    const svc = createCapabilityResolutionService()
    const rec1 = makeProviderRecord({ packageId: 'pkg-cat1', capabilityId: 'cap.multi' })
    const rec2 = makeProviderRecord({ packageId: 'pkg-cat2', capabilityId: 'cap.multi' })
    const cat1 = mockCatalog('cat-1', [rec1])
    const cat2 = mockCatalog('cat-2', [rec2])
    const input = makeInput(makeRequirementSet('cap.multi'), [cat1, cat2])
    const result = await svc.buildGraph(input)
    expect(result.status).toBe('built')
    if (result.status !== 'built') return
    const candidateNodes = result.graph.nodes.filter(n => n.kind === 'capability-provider-candidate')
    const pkgIds = candidateNodes.map((n: any) => n.packageId)
    expect(pkgIds).toContain('pkg-cat1')
    expect(pkgIds).toContain('pkg-cat2')
  })

  it('unsatisfiable: solve returns plan even when no providers exist', async () => {
    const svc = createCapabilityResolutionService()
    const input = makeInput(makeRequirementSet('cap.missing'), [mockCatalog('cat-1', [])])
    const result = await svc.buildGraph(input)
    expect(result.status).toBe('built')
    if (result.status !== 'built') return
    const plan = await svc.solve(result.graph)
    expect(plan).toBeDefined()
    expect(plan.status).toBe('unsatisfiable')
    expect(plan.unresolvedRequirements.filter(u => u.necessity === 'required').length).toBeGreaterThanOrEqual(1)
  })

  it('determinism: two runs on same input produce identical graphId and planId', async () => {
    const svc = createCapabilityResolutionService()
    const record = makeProviderRecord({ packageId: 'pkg-det', capabilityId: 'cap.det' })
    const input = makeInput(makeRequirementSet('cap.det'), [mockCatalog('cat-1', [record])])

    const r1 = await svc.buildGraph(input)
    const r2 = await svc.buildGraph(input)
    expect(r1.status).toBe('built')
    expect(r2.status).toBe('built')
    if (r1.status !== 'built' || r2.status !== 'built') return

    expect(r1.graph.graphId).toBe(r2.graph.graphId)

    const plan1 = await svc.solve(r1.graph)
    const plan2 = await svc.solve(r2.graph)
    expect(plan1.planId).toBe(plan2.planId)
  })

  it('solve does not call any catalog method (proven via call counter)', async () => {
    const svc = createCapabilityResolutionService()
    const record = makeProviderRecord({ packageId: 'pkg-spy', capabilityId: 'cap.spy' })

    let catalogCallCount = 0
    const spyCatalog: CapabilityCatalog = {
      catalogId: 'cat-spy' as CatalogId,
      sourceKind: 'organization',
      getSnapshot: async () => { catalogCallCount++; return makeSnapshot('cat-spy') },
      findProviders: async () => { catalogCallCount++; return [record] },
      findPackageVersions: async () => { catalogCallCount++; return [] },
      getPackageDescriptor: async (_snap, pkgId) => { catalogCallCount++; return emptyDescriptor(pkgId as string) },
    }

    const input = makeInput(makeRequirementSet('cap.spy'), [spyCatalog])
    const result = await svc.buildGraph(input)
    expect(result.status).toBe('built')
    if (result.status !== 'built') return

    const countAfterBuild = catalogCallCount
    expect(countAfterBuild).toBeGreaterThan(0) // buildGraph did call catalog

    await svc.solve(result.graph)
    expect(catalogCallCount).toBe(countAfterBuild) // solve called nothing extra
  })

  it('serialize produces valid JSON that round-trips to the same plan shape', async () => {
    const svc = createCapabilityResolutionService()
    const record = makeProviderRecord({ packageId: 'pkg-serial', capabilityId: 'cap.serial' })
    const input = makeInput(makeRequirementSet('cap.serial'), [mockCatalog('cat-1', [record])])
    const result = await svc.buildGraph(input)
    expect(result.status).toBe('built')
    if (result.status !== 'built') return
    const plan = await svc.solve(result.graph)
    const json = svc.serialize(plan)
    const parsed = JSON.parse(json)
    expect(parsed.planId).toBe(plan.planId)
    expect(parsed.status).toBe(plan.status)
    expect(Array.isArray(parsed.selectedProviders)).toBe(true)
  })

  it('service object exposes buildGraph, solve, serialize as methods', () => {
    const svc = createCapabilityResolutionService()
    expect(typeof svc.buildGraph).toBe('function')
    expect(typeof svc.solve).toBe('function')
    expect(typeof svc.serialize).toBe('function')
  })

  it('serialize output is indented JSON (pretty-printed)', async () => {
    const svc = createCapabilityResolutionService()
    const record = makeProviderRecord({ packageId: 'pkg-pretty', capabilityId: 'cap.pretty' })
    const input = makeInput(makeRequirementSet('cap.pretty'), [mockCatalog('cat-1', [record])])
    const result = await svc.buildGraph(input)
    expect(result.status).toBe('built')
    if (result.status !== 'built') return
    const plan = await svc.solve(result.graph)
    const json = svc.serialize(plan)
    // JSON.stringify with null, 2 → contains newlines and spaces
    expect(json).toContain('\n')
    expect(json).toContain('  ')
  })
})
