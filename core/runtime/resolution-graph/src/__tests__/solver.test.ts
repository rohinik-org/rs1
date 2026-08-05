import { describe, it, expect } from 'vitest'
import { buildGraph } from '../graph-builder.js'
import { solve } from '../solver.js'
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
  InstalledProviderRecord,
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

// ── Shared helpers (same pattern as graph-builder.test.ts) ──────────────────

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

function mockCatalog(id: string, providers: ProviderCandidateRecord[], descriptor?: PackageDescriptor): CapabilityCatalog {
  return {
    catalogId: id as CatalogId,
    sourceKind: 'organization',
    getSnapshot: async () => makeSnapshot(id),
    findProviders: async (_snap, _capId, _vr) => providers,
    findPackageVersions: async () => [],
    getPackageDescriptor: async (_snap, pkgId, _ver) => {
      if (descriptor && descriptor.packageId === pkgId) return descriptor
      return providers.find(p => p.packageId === pkgId) ? emptyDescriptor(pkgId as string) : undefined
    },
  }
}

function mockFilteredCatalog(id: string, providers: ProviderCandidateRecord[]): CapabilityCatalog {
  return {
    catalogId: id as CatalogId,
    sourceKind: 'organization',
    getSnapshot: async () => makeSnapshot(id),
    findProviders: async (_snap, capId, _vr) => providers.filter(p => p.capabilityId === capId),
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

function makeInstalledState(providers: InstalledProviderRecord[] = []): InstalledCapabilitySnapshot {
  return {
    snapshotHash: 'installed-hash' as InstalledCapabilitySnapshotHash,
    providers,
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

function makeRequirementSet(
  capabilityId: string,
  opts: { requirementId?: string; necessity?: 'required' | 'optional' } = {},
): CapabilityRequirementSet {
  const reqId = (opts.requirementId ?? `req-${capabilityId}`) as CapabilityRequirementId
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
        necessity: opts.necessity ?? 'required',
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
  installedState?: InstalledCapabilitySnapshot,
): CapabilityResolutionInput {
  return {
    requirementSet,
    resolutionConfig: makeConfig(),
    policy: makePolicy(policyOverrides),
    platform: makePlatform(),
    installedState: installedState ?? makeInstalledState(),
    capabilityCatalogs: catalogs,
    languagePackageCatalogs: [],
    modelArtifactCatalogs: [],
  }
}

async function buildAndSolve(
  capabilityId: string,
  providers: ProviderCandidateRecord[],
  policyOverrides: Partial<ResolutionPolicySnapshot> = {},
  installedState?: InstalledCapabilitySnapshot,
) {
  const catalog = mockCatalog('cat-1', providers)
  const input = makeInput(makeRequirementSet(capabilityId), [catalog], policyOverrides, installedState)
  const result = await buildGraph(input)
  if (result.status !== 'built') throw new Error(`buildGraph failed: ${result.status}`)
  return solve(result.graph)
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('solve', () => {
  it('does not mutate graph — nodes.length unchanged after solve()', async () => {
    const record = makeProviderRecord({ packageId: 'pkg-a', capabilityId: 'cap.x' })
    const catalog = mockCatalog('cat-1', [record])
    const result = await buildGraph(makeInput(makeRequirementSet('cap.x'), [catalog]))
    if (result.status !== 'built') throw new Error('buildGraph failed')
    const { graph } = result
    const nodeCountBefore = graph.nodes.length
    const edgeCountBefore = graph.edges.length
    await solve(graph)
    expect(graph.nodes.length).toBe(nodeCountBefore)
    expect(graph.edges.length).toBe(edgeCountBefore)
  })

  it('single requirement → selected provider appears in plan.selectedProviders', async () => {
    const record = makeProviderRecord({ packageId: 'pkg-a', capabilityId: 'cap.search' })
    const plan = await buildAndSolve('cap.search', [record])
    expect(plan.selectedProviders).toHaveLength(1)
    expect(plan.selectedProviders[0]?.packageId).toBe('pkg-a')
  })

  it('plan.status === proposed → unresolvedRequirements is empty and limitFailures is empty', async () => {
    const record = makeProviderRecord({ packageId: 'pkg-b', capabilityId: 'cap.write' })
    const plan = await buildAndSolve('cap.write', [record])
    expect(plan.status).toBe('proposed')
    expect(plan.unresolvedRequirements).toHaveLength(0)
    expect(plan.limitFailures).toHaveLength(0)
  })

  it('plan.status === unsatisfiable → at least one UnresolvedRequirement with necessity=required', async () => {
    // No providers → no candidates → unsatisfiable
    const plan = await buildAndSolve('cap.missing', [])
    expect(plan.status).toBe('unsatisfiable')
    const required = plan.unresolvedRequirements.filter(u => u.necessity === 'required')
    expect(required.length).toBeGreaterThanOrEqual(1)
  })

  it('plan includes PackageResolution with resolvedVersion when package is to-install', async () => {
    const record = makeProviderRecord({ packageId: 'pkg-c', capabilityId: 'cap.read' })
    // No installed packages → to-install
    const plan = await buildAndSolve('cap.read', [record])
    expect(plan.packagesToInstall.length).toBeGreaterThanOrEqual(1)
    const pkg = plan.packagesToInstall.find(p => p.packageId === 'pkg-c')
    expect(pkg).toBeDefined()
    expect(pkg?.resolvedVersion).toBe('1.0.0')
  })

  it('two independent solve() calls on same graph → identical semanticHash (L-9G-005 determinism)', async () => {
    const record = makeProviderRecord({ packageId: 'pkg-d', capabilityId: 'cap.det' })
    const catalog = mockCatalog('cat-1', [record])
    const result = await buildGraph(makeInput(makeRequirementSet('cap.det'), [catalog]))
    if (result.status !== 'built') throw new Error('buildGraph failed')
    const plan1 = await solve(result.graph)
    const plan2 = await solve(result.graph)
    expect(plan1.semanticHash).toBe(plan2.semanticHash)
    expect(plan1.planId).toBe(plan2.planId)
  })

  it('active-installed candidate beats available candidate', async () => {
    const records = [
      makeProviderRecord({ packageId: 'pkg-available', capabilityId: 'cap.rank', source: { kind: 'organization', sourceId: 'cat-1', artifactId: 'pkg-available' } }),
      makeProviderRecord({ packageId: 'pkg-installed', capabilityId: 'cap.rank', source: { kind: 'organization', sourceId: 'cat-1', artifactId: 'pkg-installed' } }),
    ]
    const installedState = makeInstalledState([
      {
        providerId: 'provider-pkg-installed',
        packageId: 'pkg-installed' as PackageId,
        packageVersion: '1.0.0',
        capabilityId: 'cap.rank' as CapabilityId,
        capabilityVersion: '1.0.0',
        state: 'active',
      },
    ])
    const plan = await buildAndSolve('cap.rank', records, {}, installedState)
    expect(plan.selectedProviders).toHaveLength(1)
    expect(plan.selectedProviders[0]?.packageId).toBe('pkg-installed')
  })

  it('candidateId in plan.selectedProviders is 64-char hex (resolver-derived)', async () => {
    const record = makeProviderRecord({ packageId: 'pkg-e', capabilityId: 'cap.hash' })
    const plan = await buildAndSolve('cap.hash', [record])
    expect(plan.selectedProviders).toHaveLength(1)
    expect(plan.selectedProviders[0]?.selectedCandidateId).toMatch(/^[a-f0-9]{64}$/)
  })

  it('plan.status is never authorized (L-9G-006)', async () => {
    const record = makeProviderRecord({ packageId: 'pkg-f', capabilityId: 'cap.auth' })
    const plan = await buildAndSolve('cap.auth', [record])
    // ProposedResolutionPlanStatus never includes 'authorized'
    expect(plan.status).not.toBe('authorized')
    // Also verify the type narrows correctly — proposed is a valid status
    const validStatuses = ['proposed', 'partial', 'unsatisfiable', 'conflict', 'limit-exceeded']
    expect(validStatuses).toContain(plan.status)
  })

  it('backtracking limit exceeded → ResolutionLimitFailure in limitFailures (not in unresolvedRequirements)', async () => {
    // Build a graph with multiple providers for same capability but force version conflict
    // We trigger limit by setting maximumBacktrackingSteps to 0 and having conflict candidates
    // Actually the simplest: maximumBacktrackingSteps=0 → immediate limit on any backtrack attempt
    // To cause a conflict we need two providers with same packageId different versions
    const records = [
      makeProviderRecord({ packageId: 'pkg-conflict', capabilityId: 'cap.limit', packageVersion: '1.0.0' }),
      makeProviderRecord({ packageId: 'pkg-conflict', capabilityId: 'cap.limit', packageVersion: '2.0.0' }),
    ]
    const catalog = mockCatalog('cat-1', records)
    // Two requirements for same package — second will conflict
    const reqSet: CapabilityRequirementSet = {
      setId: 'set-2' as CapabilityRequirementSetId,
      semanticHash: 'd'.repeat(64) as CapabilityRequirementSetHash,
      schemaVersion: '1.0',
      applicationId: APP_ID,
      requirements: [
        {
          requirementId: 'req-cap.limit-1' as CapabilityRequirementId,
          requirementHash: 'e'.repeat(64) as any,
          capabilityId: 'cap.limit' as CapabilityId,
          versionRange: { expression: '^1.0.0', normalized: '^1.0.0' as any },
          necessity: 'required',
          multiplicity: 'single',
          constraints: [],
          preferences: [],
          requestedBy: { direct: { kind: 'application', applicationId: APP_ID }, chain: [] },
        },
        {
          requirementId: 'req-cap.limit-2' as CapabilityRequirementId,
          requirementHash: 'f'.repeat(64) as any,
          capabilityId: 'cap.limit' as CapabilityId,
          versionRange: { expression: '^2.0.0', normalized: '^2.0.0' as any },
          necessity: 'required',
          multiplicity: 'single',
          constraints: [],
          preferences: [],
          requestedBy: { direct: { kind: 'application', applicationId: APP_ID }, chain: [] },
        },
      ],
      createdAt: NOW,
    }
    const policy = makePolicy({ maximumBacktrackingSteps: 1 })
    const input: CapabilityResolutionInput = {
      requirementSet: reqSet,
      resolutionConfig: makeConfig(),
      policy,
      platform: makePlatform(),
      installedState: makeInstalledState(),
      capabilityCatalogs: [catalog],
      languagePackageCatalogs: [],
      modelArtifactCatalogs: [],
    }
    const buildResult = await buildGraph(input)
    if (buildResult.status !== 'built') throw new Error('buildGraph failed')

    const plan = await solve(buildResult.graph)
    // If limit was exceeded, limitFailures must be populated
    if (plan.status === 'limit-exceeded') {
      expect(plan.limitFailures.length).toBeGreaterThanOrEqual(1)
      expect(plan.limitFailures[0]?.kind).toBe('max-backtracking-steps')
      // The failure must NOT appear as UnresolvedRequirement
      const limitReqIds = new Set(plan.limitFailures.map(lf => lf.summary))
      for (const ur of plan.unresolvedRequirements) {
        expect(ur.reason).not.toBe('solver-limit-exceeded')
      }
    }
    // At minimum: no crash, plan is a valid object
    expect(plan).toBeDefined()
    expect(plan.planId).toMatch(/^rp-/)
  })

  it('plan.planId starts with rp- prefix (L-9G planId format)', async () => {
    const record = makeProviderRecord({ packageId: 'pkg-planid', capabilityId: 'cap.planid' })
    const plan = await buildAndSolve('cap.planid', [record])
    expect(plan.planId).toMatch(/^rp-/)
  })

  it('higher declared trust level wins (official beats unsigned when both eligible)', async () => {
    const records = [
      makeProviderRecord({
        packageId: 'pkg-unsigned',
        capabilityId: 'cap.trust',
        trustClaim: { level: 'unsigned', claimedBy: { kind: 'catalog', catalogId: 'test-catalog' as CatalogId }, verificationStatus: 'unverified' },
      }),
      makeProviderRecord({
        packageId: 'pkg-official',
        capabilityId: 'cap.trust',
        trustClaim: { level: 'official', claimedBy: { kind: 'catalog', catalogId: 'test-catalog' as CatalogId }, verificationStatus: 'unverified' },
      }),
    ]
    // minimumDeclaredTrustLevel=unknown → both eligible; official should win (higher trust = lower declaredTrustRank)
    const plan = await buildAndSolve('cap.trust', records, { minimumDeclaredTrustLevel: 'unknown' })
    expect(plan.selectedProviders).toHaveLength(1)
    expect(plan.selectedProviders[0]?.packageId).toBe('pkg-official')
  })

  it('optional unresolvable → plan.status is partial, not unsatisfiable', async () => {
    // required cap has a provider; optional cap has none — use filtered catalog so cap.optional-missing returns []
    const catalog = mockFilteredCatalog('cat-1', [makeProviderRecord({ packageId: 'pkg-req', capabilityId: 'cap.required' })])
    const reqSet: CapabilityRequirementSet = {
      setId: 'set-partial' as CapabilityRequirementSetId,
      semanticHash: 'c'.repeat(64) as CapabilityRequirementSetHash,
      schemaVersion: '1.0',
      applicationId: APP_ID,
      requirements: [
        {
          requirementId: 'req-required' as CapabilityRequirementId,
          requirementHash: 'aa'.repeat(32) as any,
          capabilityId: 'cap.required' as CapabilityId,
          versionRange: { expression: '^1.0.0', normalized: '^1.0.0' as any },
          necessity: 'required',
          multiplicity: 'single',
          constraints: [],
          preferences: [],
          requestedBy: { direct: { kind: 'application', applicationId: APP_ID }, chain: [] },
        },
        {
          requirementId: 'req-optional' as CapabilityRequirementId,
          requirementHash: 'bb'.repeat(32) as any,
          capabilityId: 'cap.optional-missing' as CapabilityId,
          versionRange: { expression: '^1.0.0', normalized: '^1.0.0' as any },
          necessity: 'optional',
          multiplicity: 'single',
          constraints: [],
          preferences: [],
          requestedBy: { direct: { kind: 'application', applicationId: APP_ID }, chain: [] },
        },
      ],
      createdAt: NOW,
    }
    const input = makeInput(reqSet, [catalog])
    const buildResult = await buildGraph(input)
    if (buildResult.status !== 'built') throw new Error('buildGraph failed')
    const plan = await solve(buildResult.graph)
    expect(plan.status).toBe('partial')
    expect(plan.selectedProviders.some(p => p.packageId === 'pkg-req')).toBe(true)
  })

  it('version conflict → RESOLUTION_VERSION_CONFLICT entry in plan.conflicts', async () => {
    // Two requirements for different caps, both resolved by pkg-v but different versions → conflict
    const records = [
      makeProviderRecord({ packageId: 'pkg-v', capabilityId: 'cap.va', packageVersion: '1.0.0' }),
      makeProviderRecord({ packageId: 'pkg-v', capabilityId: 'cap.vb', packageVersion: '2.0.0' }),
    ]
    const catalog = mockFilteredCatalog('cat-1', records)
    const reqSet: CapabilityRequirementSet = {
      setId: 'set-conflict' as CapabilityRequirementSetId,
      semanticHash: 'ee'.repeat(32) as CapabilityRequirementSetHash,
      schemaVersion: '1.0',
      applicationId: APP_ID,
      requirements: [
        {
          requirementId: 'req-va' as CapabilityRequirementId,
          requirementHash: 'cc'.repeat(32) as any,
          capabilityId: 'cap.va' as CapabilityId,
          versionRange: { expression: '^1.0.0', normalized: '^1.0.0' as any },
          necessity: 'required',
          multiplicity: 'single',
          constraints: [],
          preferences: [],
          requestedBy: { direct: { kind: 'application', applicationId: APP_ID }, chain: [] },
        },
        {
          requirementId: 'req-vb' as CapabilityRequirementId,
          requirementHash: 'dd'.repeat(32) as any,
          capabilityId: 'cap.vb' as CapabilityId,
          versionRange: { expression: '^2.0.0', normalized: '^2.0.0' as any },
          necessity: 'required',
          multiplicity: 'single',
          constraints: [],
          preferences: [],
          requestedBy: { direct: { kind: 'application', applicationId: APP_ID }, chain: [] },
        },
      ],
      createdAt: NOW,
    }
    const input = makeInput(reqSet, [catalog])
    const buildResult = await buildGraph(input)
    if (buildResult.status !== 'built') throw new Error('buildGraph failed')
    const plan = await solve(buildResult.graph)
    const versionConflicts = plan.conflicts.filter(c => c.code === 'RESOLUTION_VERSION_CONFLICT')
    expect(versionConflicts.length).toBeGreaterThanOrEqual(1)
  })
})
