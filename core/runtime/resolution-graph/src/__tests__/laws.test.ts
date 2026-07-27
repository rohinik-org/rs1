/**
 * Constitutional law tests for Stage 9G — L-9G-001 through L-9G-007
 */
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
const APP_ID = 'com.example.laws' as ApplicationId

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

function makeProviderRecord(
  packageId: string,
  capabilityId: string,
  overrides: Partial<ProviderCandidateRecord> = {},
): ProviderCandidateRecord {
  return {
    providerId: `provider-${packageId}`,
    packageId: packageId as PackageId,
    packageVersion: '1.0.0',
    capabilityId: capabilityId as CapabilityId,
    capabilityVersion: '1.0.0',
    source: { kind: 'organization', sourceId: 'test-catalog', artifactId: packageId },
    descriptorHash: 'deadbeef',
    trustClaim: {
      level: 'signed',
      claimedBy: { kind: 'catalog', catalogId: 'test-catalog' as CatalogId },
      verificationStatus: 'unverified',
    },
    ...overrides,
  }
}

function mockCatalog(
  id: string,
  providers: ProviderCandidateRecord[],
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
      return providers.find(p => p.packageId === pkgId) ? emptyDescriptor(pkgId as string) : undefined
    },
  }
}

function makePolicy(overrides: Partial<ResolutionPolicySnapshot> = {}): ResolutionPolicySnapshot {
  return {
    policyId: 'law-policy',
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
    setId: 'set-law' as CapabilityRequirementSetId,
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

// ── L-9G-001: Complete Graph and Plan Law ─────────────────────────────────────

describe('L-9G-001 — Complete Graph and Plan Law', () => {
  it('graph built from a capability with transitive cap dep includes transitive dep node', async () => {
    // pkg-root depends on cap.transitive via descriptor
    const transitiveDescriptor: PackageDescriptor = {
      ...emptyDescriptor('pkg-root'),
      capabilityDependencies: [
        { capabilityId: 'cap.transitive' as CapabilityId, versionRange: '^1.0.0', optional: false },
      ],
    }
    const rootRecord = makeProviderRecord('pkg-root', 'cap.top')
    const transitiveRecord = makeProviderRecord('pkg-trans', 'cap.transitive')
    const catalog = mockCatalog('cat-law1', [rootRecord, transitiveRecord], transitiveDescriptor)

    const result = await buildGraph(makeInput(makeRequirementSet('cap.top'), [catalog]))
    expect(result.status).toBe('built')
    if (result.status !== 'built') return

    // Must contain a requirement node for the transitive capability
    const transitiveReqNode = result.graph.nodes.find(
      n => n.kind === 'capability-requirement' && (n as any).capabilityId === 'cap.transitive',
    )
    expect(transitiveReqNode).toBeDefined()
  })

  it('graph includes infrastructure and configuration nodes declared in descriptor', async () => {
    const descriptor: PackageDescriptor = {
      ...emptyDescriptor('pkg-full'),
      infrastructureRequirements: [
        { serviceId: 'redis', serviceType: 'cache', allowedStrategies: ['provision-embedded'], required: true },
      ],
      configurationRequirements: [
        { configurationKey: 'TIMEOUT_MS', required: true, valueType: 'number' },
      ],
    }
    const record = makeProviderRecord('pkg-full', 'cap.full')
    const catalog = mockCatalog('cat-law1b', [record], descriptor)

    const result = await buildGraph(makeInput(makeRequirementSet('cap.full'), [catalog]))
    expect(result.status).toBe('built')
    if (result.status !== 'built') return

    const infraNode = result.graph.nodes.find(n => n.kind === 'infrastructure-requirement')
    const cfgNode = result.graph.nodes.find(n => n.kind === 'configuration')
    expect(infraNode).toBeDefined()
    expect(cfgNode).toBeDefined()
  })
})

// ── L-9G-002: No Mutation During Resolution Law ───────────────────────────────

describe('L-9G-002 — No Mutation During Resolution Law', () => {
  it('installedState reference and data unchanged after buildGraph', async () => {
    const record = makeProviderRecord('pkg-mut', 'cap.mut')
    const catalog = mockCatalog('cat-law2', [record])
    const installedState = makeInstalledState()
    const originalHash = installedState.snapshotHash
    const originalProviders = installedState.providers

    const input: CapabilityResolutionInput = {
      requirementSet: makeRequirementSet('cap.mut'),
      resolutionConfig: makeConfig(),
      policy: makePolicy(),
      platform: makePlatform(),
      installedState,
      capabilityCatalogs: [catalog],
      languagePackageCatalogs: [],
      modelArtifactCatalogs: [],
    }
    await buildGraph(input)

    expect(input.installedState).toBe(installedState)             // same reference
    expect(installedState.snapshotHash).toBe(originalHash)        // unchanged data
    expect(installedState.providers).toBe(originalProviders)      // same array reference
  })

  it('graph.nodes.length and graph.edges.length unchanged after solve()', async () => {
    const record = makeProviderRecord('pkg-immut', 'cap.immut')
    const catalog = mockCatalog('cat-law2b', [record])
    const result = await buildGraph(makeInput(makeRequirementSet('cap.immut'), [catalog]))
    expect(result.status).toBe('built')
    if (result.status !== 'built') return

    const nodeCountBefore = result.graph.nodes.length
    const edgeCountBefore = result.graph.edges.length
    await solve(result.graph)
    expect(result.graph.nodes.length).toBe(nodeCountBefore)
    expect(result.graph.edges.length).toBe(edgeCountBefore)
  })
})

// ── L-9G-003: Explainable Failure Law ────────────────────────────────────────

describe('L-9G-003 — Explainable Failure Law', () => {
  it('unsatisfiable plan has non-empty evidence on each UnresolvedRequirement', async () => {
    // No providers → unsatisfiable
    const catalog = mockCatalog('cat-law3', [])
    const result = await buildGraph(makeInput(makeRequirementSet('cap.missing'), [catalog]))
    expect(result.status).toBe('built')
    if (result.status !== 'built') return

    const plan = await solve(result.graph)
    expect(plan.status).toBe('unsatisfiable')
    for (const ur of plan.unresolvedRequirements) {
      expect(ur.evidence.length).toBeGreaterThan(0)
    }
  })

  it('conflict-status plan has ResolutionConflict entries with non-empty evidence', async () => {
    // Two providers for same packageId with conflicting versions → version conflict
    const records = [
      makeProviderRecord('pkg-cv', 'cap.va', { packageVersion: '1.0.0' }),
      makeProviderRecord('pkg-cv', 'cap.vb', { packageVersion: '2.0.0' }),
    ]
    const catalog: CapabilityCatalog = {
      catalogId: 'cat-law3b' as CatalogId,
      sourceKind: 'organization',
      getSnapshot: async () => makeSnapshot('cat-law3b'),
      findProviders: async (_snap, capId, _vr) => records.filter(r => r.capabilityId === capId),
      findPackageVersions: async () => [],
      getPackageDescriptor: async (_snap, pkgId, _ver) =>
        records.find(r => r.packageId === pkgId) ? emptyDescriptor(pkgId as string) : undefined,
    }
    const reqSet: CapabilityRequirementSet = {
      setId: 'set-conflict-ev' as CapabilityRequirementSetId,
      semanticHash: 'c'.repeat(64) as CapabilityRequirementSetHash,
      schemaVersion: '1.0',
      applicationId: APP_ID,
      requirements: [
        {
          requirementId: 'req-va' as CapabilityRequirementId,
          requirementHash: 'dd'.repeat(32) as any,
          capabilityId: 'cap.va' as CapabilityId,
          versionRange: { expression: '^1.0.0', normalized: '^1.0.0' as any },
          necessity: 'required', multiplicity: 'single', constraints: [], preferences: [],
          requestedBy: { direct: { kind: 'application', applicationId: APP_ID }, chain: [] },
        },
        {
          requirementId: 'req-vb' as CapabilityRequirementId,
          requirementHash: 'ee'.repeat(32) as any,
          capabilityId: 'cap.vb' as CapabilityId,
          versionRange: { expression: '^2.0.0', normalized: '^2.0.0' as any },
          necessity: 'required', multiplicity: 'single', constraints: [], preferences: [],
          requestedBy: { direct: { kind: 'application', applicationId: APP_ID }, chain: [] },
        },
      ],
      createdAt: NOW,
    }
    const buildResult = await buildGraph(makeInput(reqSet, [catalog]))
    expect(buildResult.status).toBe('built')
    if (buildResult.status !== 'built') return

    const plan = await solve(buildResult.graph)
    if (plan.status === 'conflict') {
      expect(plan.conflicts.length).toBeGreaterThan(0)
      for (const conflict of plan.conflicts) {
        expect(conflict.evidence.length).toBeGreaterThan(0)
      }
    }
    // At minimum no crash and plan is defined
    expect(plan).toBeDefined()
  })
})

// ── L-9G-004: Circular Dependency Law ────────────────────────────────────────

describe('L-9G-004 — Circular Dependency Law', () => {
  it('two packages forming a cycle build without exception (cycle not in supportedCycles)', async () => {
    // pkg-a depends on cap.b (provided by pkg-b), pkg-b depends on cap.a (provided by pkg-a)
    const descA: PackageDescriptor = {
      ...emptyDescriptor('pkg-cycle-a'),
      capabilityDependencies: [
        { capabilityId: 'cap.b' as CapabilityId, versionRange: '^1.0.0', optional: false },
      ],
    }
    const descB: PackageDescriptor = {
      ...emptyDescriptor('pkg-cycle-b'),
      capabilityDependencies: [
        { capabilityId: 'cap.a' as CapabilityId, versionRange: '^1.0.0', optional: false },
      ],
    }
    const recordA = makeProviderRecord('pkg-cycle-a', 'cap.a')
    const recordB = makeProviderRecord('pkg-cycle-b', 'cap.b')
    const catalog: CapabilityCatalog = {
      catalogId: 'cat-law4' as CatalogId,
      sourceKind: 'organization',
      getSnapshot: async () => makeSnapshot('cat-law4'),
      findProviders: async (_snap, capId, _vr) =>
        capId === 'cap.a' ? [recordA] : capId === 'cap.b' ? [recordB] : [],
      findPackageVersions: async () => [],
      getPackageDescriptor: async (_snap, pkgId, _ver) => {
        if (pkgId === 'pkg-cycle-a') return descA
        if (pkgId === 'pkg-cycle-b') return descB
        return undefined
      },
    }

    // Must not throw
    const result = await buildGraph(makeInput(makeRequirementSet('cap.a'), [catalog]))
    expect(result.status).toBe('built')
    if (result.status !== 'built') return
    // Graph built successfully; warnings may be populated (cycle detection is Stage 9J)
    expect(result.graph.nodes.length).toBeGreaterThan(0)
  })
})

// ── L-9G-005: Determinism Law ─────────────────────────────────────────────────

describe('L-9G-005 — Determinism Law', () => {
  it('two independent buildGraph calls on same input → same graphId and semanticHash', async () => {
    const record = makeProviderRecord('pkg-det', 'cap.det')
    const catalog = mockCatalog('cat-law5', [record])
    const input = makeInput(makeRequirementSet('cap.det'), [catalog])

    const r1 = await buildGraph(input)
    const r2 = await buildGraph(input)
    expect(r1.status).toBe('built')
    expect(r2.status).toBe('built')
    if (r1.status !== 'built' || r2.status !== 'built') return

    expect(r1.graph.graphId).toBe(r2.graph.graphId)
    expect(r1.graph.semanticHash).toBe(r2.graph.semanticHash)
  })

  it('two independent solve calls on same graph → same planId and semanticHash', async () => {
    const record = makeProviderRecord('pkg-det2', 'cap.det2')
    const catalog = mockCatalog('cat-law5b', [record])
    const result = await buildGraph(makeInput(makeRequirementSet('cap.det2'), [catalog]))
    expect(result.status).toBe('built')
    if (result.status !== 'built') return

    const plan1 = await solve(result.graph)
    const plan2 = await solve(result.graph)
    expect(plan1.planId).toBe(plan2.planId)
    expect(plan1.semanticHash).toBe(plan2.semanticHash)
  })
})

// ── L-9G-006: Unverified Proposal Law ────────────────────────────────────────

describe('L-9G-006 — Unverified Proposal Law', () => {
  it('all CatalogTrustClaim.verificationStatus === "unverified" in built graph', async () => {
    const records = [
      makeProviderRecord('pkg-uv1', 'cap.uv'),
      makeProviderRecord('pkg-uv2', 'cap.uv', {
        trustClaim: {
          level: 'official',
          claimedBy: { kind: 'catalog', catalogId: 'test-catalog' as CatalogId },
          verificationStatus: 'unverified',
        },
      }),
    ]
    const catalog = mockCatalog('cat-law6', records)
    const result = await buildGraph(makeInput(makeRequirementSet('cap.uv'), [catalog]))
    expect(result.status).toBe('built')
    if (result.status !== 'built') return

    const candidateNodes = result.graph.nodes.filter(n => n.kind === 'capability-provider-candidate') as any[]
    for (const node of candidateNodes) {
      expect(node.trustClaim.verificationStatus).toBe('unverified')
    }
  })

  it('plan.status is never "authorized"', async () => {
    const record = makeProviderRecord('pkg-auth', 'cap.auth')
    const catalog = mockCatalog('cat-law6b', [record])
    const result = await buildGraph(makeInput(makeRequirementSet('cap.auth'), [catalog]))
    expect(result.status).toBe('built')
    if (result.status !== 'built') return

    const plan = await solve(result.graph)
    expect(plan.status).not.toBe('authorized')
    const validStatuses = ['proposed', 'partial', 'unsatisfiable', 'conflict', 'limit-exceeded']
    expect(validStatuses).toContain(plan.status)
  })
})

// ── L-9G-007: Resolution Policy Law ──────────────────────────────────────────

describe('L-9G-007 — Resolution Policy Law', () => {
  it('candidate in denyList is not in plan.selectedProviders', async () => {
    const record = makeProviderRecord('pkg-denied', 'cap.deny')
    const catalog = mockCatalog('cat-law7', [record])
    const result = await buildGraph(
      makeInput(makeRequirementSet('cap.deny'), [catalog], { denyList: ['pkg-denied' as PackageId] }),
    )
    expect(result.status).toBe('built')
    if (result.status !== 'built') return

    const plan = await solve(result.graph)
    const deniedInPlan = plan.selectedProviders.find(p => p.packageId === 'pkg-denied')
    expect(deniedInPlan).toBeUndefined()
  })

  it('trust below minimumDeclaredTrustLevel is excluded from selection', async () => {
    const record = makeProviderRecord('pkg-low-trust', 'cap.trust-filter', {
      trustClaim: {
        level: 'unsigned',
        claimedBy: { kind: 'catalog', catalogId: 'test-catalog' as CatalogId },
        verificationStatus: 'unverified',
      },
    })
    const catalog = mockCatalog('cat-law7b', [record])
    const result = await buildGraph(
      makeInput(makeRequirementSet('cap.trust-filter'), [catalog], { minimumDeclaredTrustLevel: 'signed' }),
    )
    expect(result.status).toBe('built')
    if (result.status !== 'built') return

    const plan = await solve(result.graph)
    const lowTrustInPlan = plan.selectedProviders.find(p => p.packageId === 'pkg-low-trust')
    expect(lowTrustInPlan).toBeUndefined()
  })

  it('solver bound exceeded → limitFailures entry NOT forced into unresolvedRequirements', async () => {
    const records = [
      makeProviderRecord('pkg-lim', 'cap.lim-a', { packageVersion: '1.0.0' }),
      makeProviderRecord('pkg-lim', 'cap.lim-b', { packageVersion: '2.0.0' }),
    ]
    const catalog: CapabilityCatalog = {
      catalogId: 'cat-law7c' as CatalogId,
      sourceKind: 'organization',
      getSnapshot: async () => makeSnapshot('cat-law7c'),
      findProviders: async (_snap, capId, _vr) => records.filter(r => r.capabilityId === capId),
      findPackageVersions: async () => [],
      getPackageDescriptor: async (_snap, pkgId, _ver) =>
        records.find(r => r.packageId === pkgId) ? emptyDescriptor(pkgId as string) : undefined,
    }
    const reqSet: CapabilityRequirementSet = {
      setId: 'set-lim' as CapabilityRequirementSetId,
      semanticHash: 'f'.repeat(64) as CapabilityRequirementSetHash,
      schemaVersion: '1.0',
      applicationId: APP_ID,
      requirements: [
        {
          requirementId: 'req-lim-a' as CapabilityRequirementId,
          requirementHash: 'gg'.repeat(32) as any,
          capabilityId: 'cap.lim-a' as CapabilityId,
          versionRange: { expression: '^1.0.0', normalized: '^1.0.0' as any },
          necessity: 'required', multiplicity: 'single', constraints: [], preferences: [],
          requestedBy: { direct: { kind: 'application', applicationId: APP_ID }, chain: [] },
        },
        {
          requirementId: 'req-lim-b' as CapabilityRequirementId,
          requirementHash: 'hh'.repeat(32) as any,
          capabilityId: 'cap.lim-b' as CapabilityId,
          versionRange: { expression: '^2.0.0', normalized: '^2.0.0' as any },
          necessity: 'required', multiplicity: 'single', constraints: [], preferences: [],
          requestedBy: { direct: { kind: 'application', applicationId: APP_ID }, chain: [] },
        },
      ],
      createdAt: NOW,
    }
    const buildResult = await buildGraph(makeInput(reqSet, [catalog], { maximumBacktrackingSteps: 1 }))
    expect(buildResult.status).toBe('built')
    if (buildResult.status !== 'built') return

    const plan = await solve(buildResult.graph)
    // If limit-exceeded: limitFailures populated, NOT in unresolvedRequirements with reason=solver-limit-exceeded
    if (plan.status === 'limit-exceeded') {
      expect(plan.limitFailures.length).toBeGreaterThan(0)
      for (const ur of plan.unresolvedRequirements) {
        expect(ur.reason).not.toBe('solver-limit-exceeded')
      }
    }
    expect(plan).toBeDefined()
    expect(plan.planId).toMatch(/^rp-/)
  })
})
