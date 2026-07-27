import type {
  CapabilityResolutionInput,
  ResolutionGraphBuildResult,
  CapabilityResolutionGraph,
  ResolutionNode,
  ResolutionEdge,
  ResolutionDiagnostic,
  CapabilityRequirementNode,
  CapabilityProviderCandidateNode,
  RohinikPackageNode,
  InfrastructureRequirementNode,
  ConfigurationNode,
  SecretRequirementNode,
  PermissionNode,
  PlatformRequirementNode,
  ResolutionNodeId,
  ResolutionGraphStatus,
  PackageId,
  ProviderCandidateId,
  CatalogSnapshotHash,
  CatalogSnapshotReference,
  PackageDescriptor,
  CapabilityCatalog,
} from '@rohinik-org/resolution-graph-ir'
import type { CapabilityId, ApplicationId } from '@rohinik-org/capability-ir'
import type { CapabilityRequirementId, IsoTimestamp, VersionRange, VersionRangeExpression } from '@rohinik-org/capability-contracts-ir'
import { CatalogSnapshotManager } from './snapshot-manager.js'
import { deriveCandidateId, deriveGraphId, deriveNodeId } from './candidate-id.js'
import { hashGraphProjection } from './semantic-hash.js'

const RESOLVER_VERSION = '9G.0.1'

// ponytail: VersionRange.expression is the string form used in catalog queries and node versionRange fields
function versionRangeStr(vr: VersionRange | string): string {
  if (typeof vr === 'string') return vr
  return vr.expression
}

export async function buildGraph(input: CapabilityResolutionInput): Promise<ResolutionGraphBuildResult> {
  const { requirementSet, policy } = input

  if (requirementSet.requirements.length === 0) {
    return {
      status: 'invalid-input',
      diagnostics: [{ code: 'EMPTY_REQUIREMENT_SET', severity: 'error', message: 'requirementSet.requirements is empty' }],
    }
  }

  const snapshotMgr = new CatalogSnapshotManager(
    input.capabilityCatalogs,
    input.languagePackageCatalogs,
    input.modelArtifactCatalogs,
  )

  try {
    await snapshotMgr.acquireSnapshots()
  } catch (err) {
    return {
      status: 'failed',
      diagnostics: [{ code: 'SNAPSHOT_ACQUISITION_FAILED', severity: 'error', message: String(err) }],
    }
  }

  const nodes: ResolutionNode[] = []
  const edges: ResolutionEdge[] = []
  const diagnostics: ResolutionDiagnostic[] = []
  const nodeIds = new Set<ResolutionNodeId>()
  // Track visited (packageId@version) to prevent infinite recursion
  const visitedPackages = new Set<string>()

  let graphStatus: ResolutionGraphStatus = 'expanded'

  function addNode(node: ResolutionNode): boolean {
    if (nodes.length >= policy.maximumGraphNodes) {
      graphStatus = 'limit-exceeded'
      return false
    }
    if (!nodeIds.has(node.nodeId)) {
      nodes.push(node)
      nodeIds.add(node.nodeId)
    }
    return true
  }

  function addEdge(edge: ResolutionEdge): void {
    edges.push(edge)
  }

  // Create root requirement nodes from requirementSet
  const rootNodeIds: ResolutionNodeId[] = []

  for (const req of requirementSet.requirements) {
    if (nodes.length >= policy.maximumGraphNodes) {
      graphStatus = 'limit-exceeded'
      break
    }

    const vrStr = versionRangeStr(req.versionRange)
    const nodeId = deriveNodeId('req', `${req.requirementId}|${req.capabilityId}|${vrStr}`)
    const reqNode: CapabilityRequirementNode = {
      kind: 'capability-requirement',
      nodeId,
      requirementId: req.requirementId,
      capabilityId: req.capabilityId as CapabilityId,
      versionRange: req.versionRange,
      necessity: req.necessity,
      origin: { kind: 'application', applicationId: (requirementSet.applicationId ?? 'unknown-app') as ApplicationId },
    }
    addNode(reqNode)
    rootNodeIds.push(nodeId)

    await expandCandidatesForRequirement(nodeId, req.capabilityId as CapabilityId, vrStr, 0)
  }

  async function expandCandidatesForRequirement(
    reqNodeId: ResolutionNodeId,
    capabilityId: CapabilityId,
    versionRange: string,
    depth: number,
  ): Promise<void> {
    if (depth >= policy.maximumDependencyDepth) {
      graphStatus = 'limit-exceeded'
      return
    }

    for (const catalog of input.capabilityCatalogs) {
      if (nodes.length >= policy.maximumGraphNodes) {
        graphStatus = 'limit-exceeded'
        return
      }

      // Apply source eligibility policy (organization/installed/direct always allowed)
      if (catalog.sourceKind === 'marketplace' && !input.resolutionConfig.allowMarketplace) continue
      if (catalog.sourceKind === 'registry' && !input.resolutionConfig.allowExternalRegistries) continue
      if (catalog.sourceKind === 'local' && !input.resolutionConfig.allowLocalPackages) continue
      if (catalog.sourceKind === 'direct' && !input.resolutionConfig.allowExternalRegistries) continue

      const snap = snapshotMgr.getCapabilitySnapshot(catalog.catalogId)

      let records
      try {
        records = await catalog.findProviders(snap, capabilityId, versionRange as any)
      } catch {
        diagnostics.push({ code: 'CATALOG_QUERY_FAILED', severity: 'warning', message: `findProviders failed for ${capabilityId} in ${catalog.catalogId}` })
        continue
      }

      let candidateCount = 0
      for (const record of records) {
        if (candidateCount >= policy.maximumCatalogCandidatesPerRequirement) break
        if (nodes.length >= policy.maximumGraphNodes) { graphStatus = 'limit-exceeded'; return }

        // Policy: denyList
        if (policy.denyList?.includes(record.packageId)) continue
        // Policy: minimumDeclaredTrustLevel
        const trustRanks: Record<string, number> = { unknown: 0, unsigned: 1, signed: 2, verified: 3, official: 4 }
        const minRank = trustRanks[policy.minimumDeclaredTrustLevel] ?? 0
        if ((trustRanks[record.trustClaim.level] ?? 0) < minRank) continue

        const candidateId = deriveCandidateId({
          catalogSnapshotHash: snap.snapshotHash,
          providerId: record.providerId,
          packageId: record.packageId,
          packageVersion: record.packageVersion,
          capabilityId: record.capabilityId,
          capabilityVersion: record.capabilityVersion,
          sourceId: record.source.sourceId,
          artifactId: record.source.artifactId,
        })

        const installedProvider = input.installedState.providers.find(
          p => p.packageId === record.packageId && p.packageVersion === record.packageVersion
        )
        const installState = installedProvider
          ? (installedProvider.state === 'active' ? 'active-installed' : 'inactive-installed')
          : 'available'

        const candNodeId = deriveNodeId('cand', candidateId)
        const candNode: CapabilityProviderCandidateNode = {
          kind: 'capability-provider-candidate',
          nodeId: candNodeId,
          candidateId: candidateId as ProviderCandidateId,
          providerId: record.providerId,
          packageId: record.packageId,
          capabilityId: record.capabilityId as CapabilityId,
          capabilityVersion: record.capabilityVersion,
          providerVersion: record.packageVersion,
          source: record.source,
          trustClaim: record.trustClaim,
          installState,
        }
        addNode(candNode)
        addEdge({ kind: 'candidate-for', from: candNodeId, to: reqNodeId, eligibility: 'eligible', reasons: [] })
        candidateCount++

        // Expand package descriptor
        await expandPackageDescriptor(candNodeId, record.packageId, record.packageVersion, catalog, depth)
      }
    }
  }

  async function expandPackageDescriptor(
    parentNodeId: ResolutionNodeId,
    packageId: PackageId,
    version: string,
    catalog: CapabilityCatalog,
    depth: number,
  ): Promise<void> {
    const visitKey = `${packageId}@${version}`
    if (visitedPackages.has(visitKey)) return
    visitedPackages.add(visitKey)

    const snap = snapshotMgr.getCapabilitySnapshot(catalog.catalogId)
    let descriptor: PackageDescriptor | undefined
    try {
      descriptor = await catalog.getPackageDescriptor(snap, packageId, version)
    } catch {
      diagnostics.push({ code: 'DESCRIPTOR_FETCH_FAILED', severity: 'warning', message: `getPackageDescriptor failed for ${packageId}@${version}` })
      return
    }

    if (!descriptor) return

    // ponytail: descriptor hash integrity deferred to Stage 9J; catalogSnapshotHash + candidateId derivation covers tamper-detection at graph level
    const pkgNodeId = deriveNodeId('pkg', `${packageId}@${version}`)

    const installedPkg = input.installedState.packages.find(p => p.packageId === packageId && p.version === version)
    const pkgNode: RohinikPackageNode = {
      kind: 'rohinik-package',
      nodeId: pkgNodeId,
      packageId,
      versionRange: version,
      source: { kind: 'organization', sourceId: catalog.catalogId, artifactId: `${packageId}@${version}` },
      installState: installedPkg ? 'already-installed' : 'to-install',
    }
    addNode(pkgNode)
    addEdge({ kind: 'implemented-by', from: parentNodeId, to: pkgNodeId })

    if (depth >= policy.maximumDependencyDepth) {
      graphStatus = 'limit-exceeded'
      return
    }

    // Expand transitive capability deps
    for (const capDep of descriptor.capabilityDependencies) {
      if (nodes.length >= policy.maximumGraphNodes) { graphStatus = 'limit-exceeded'; return }
      const depVrStr = versionRangeStr(capDep.versionRange)
      const depReqId = `${packageId}:${capDep.capabilityId}:${depVrStr}` as CapabilityRequirementId
      const depNodeId = deriveNodeId('req', `${depReqId}|${capDep.capabilityId}|${depVrStr}`)
      const depNode: CapabilityRequirementNode = {
        kind: 'capability-requirement',
        nodeId: depNodeId,
        requirementId: depReqId,
        capabilityId: capDep.capabilityId as CapabilityId,
        versionRange: { expression: depVrStr, normalized: depVrStr as VersionRangeExpression },
        necessity: capDep.optional ? 'optional' : 'required',
        origin: { kind: 'package', packageId, version },
      }
      addNode(depNode)
      addEdge({ kind: 'depends-on', from: pkgNodeId, to: depNodeId, versionRange: depVrStr, optional: capDep.optional })
      await expandCandidatesForRequirement(depNodeId, capDep.capabilityId as CapabilityId, depVrStr, depth + 1)
    }

    // Add infrastructure requirement nodes
    for (const infraReq of descriptor.infrastructureRequirements) {
      const infraNodeId = deriveNodeId('infra', `${packageId}:${infraReq.serviceId}`)
      addNode({
        kind: 'infrastructure-requirement',
        nodeId: infraNodeId,
        serviceId: infraReq.serviceId,
        serviceType: infraReq.serviceType,
        required: infraReq.required,
        allowedStrategies: infraReq.allowedStrategies,
      } satisfies InfrastructureRequirementNode)
      addEdge({ kind: 'requires-infra', from: pkgNodeId, to: infraNodeId })
    }

    // Add configuration nodes
    for (const cfgReq of descriptor.configurationRequirements) {
      const cfgNodeId = deriveNodeId('cfg', `${packageId}:${cfgReq.configurationKey}`)
      addNode({
        kind: 'configuration',
        nodeId: cfgNodeId,
        configurationKey: cfgReq.configurationKey,
        required: cfgReq.required,
        ...(cfgReq.defaultValue !== undefined && { defaultValue: cfgReq.defaultValue }),
        valueType: cfgReq.valueType,
        requiredByPackageIds: [packageId],
      } satisfies ConfigurationNode)
      addEdge({ kind: 'requires-config', from: pkgNodeId, to: cfgNodeId })
    }

    // Add secret requirement nodes
    for (const secretReq of descriptor.secretRequirements) {
      const secretNodeId = deriveNodeId('secret', `${packageId}:${secretReq.secretName}`)
      addNode({
        kind: 'secret-requirement',
        nodeId: secretNodeId,
        secretName: secretReq.secretName,
        optional: secretReq.optional,
        purpose: secretReq.purpose,
        requiredByPackageIds: [packageId],
      } satisfies SecretRequirementNode)
      addEdge({ kind: 'requires-secret', from: pkgNodeId, to: secretNodeId })
    }

    // Add permission nodes
    for (const permReq of descriptor.permissionRequirements) {
      const permNodeId = deriveNodeId('perm', `${packageId}:${permReq.permissionName}`)
      // ponytail: allowList check is package-level; per-permission allowList deferred until policy model expands
      const assessment = policy.allowList?.includes(packageId) ? 'allowed' : 'requires-approval'
      addNode({
        kind: 'permission',
        nodeId: permNodeId,
        permissionName: permReq.permissionName,
        required: permReq.required,
        policyAssessment: assessment,
      } satisfies PermissionNode)
      addEdge({ kind: 'requires-perm', from: pkgNodeId, to: permNodeId })
    }

    // Add platform requirement nodes
    for (const platReq of descriptor.platformRequirements) {
      const platNodeId = deriveNodeId('plat', `${packageId}:${platReq.kind}:${platReq.value}`)
      let assessment: 'satisfied' | 'unsatisfied' | 'unknown' = 'unknown'
      if (platReq.kind === 'os' && input.platform.os) {
        assessment = input.platform.os === platReq.value ? 'satisfied' : 'unsatisfied'
      } else if (platReq.kind === 'arch' && input.platform.arch) {
        assessment = input.platform.arch === platReq.value ? 'satisfied' : 'unsatisfied'
      }
      addNode({
        kind: 'platform-requirement',
        nodeId: platNodeId,
        requirement: platReq,
        assessment,
      } satisfies PlatformRequirementNode)
      addEdge({ kind: 'requires-platform', from: pkgNodeId, to: platNodeId })
    }
  }

  // Compute graph snapshot references
  const capSnapshotRefs: CatalogSnapshotReference[] = snapshotMgr.getAllCapabilitySnapshots().map(s => ({
    catalogId: s.catalogId,
    snapshotHash: s.snapshotHash,
  }))
  const langSnapshotRefs: CatalogSnapshotReference[] = snapshotMgr.getAllLanguageSnapshots().map(s => ({
    catalogId: s.catalogId,
    snapshotHash: s.snapshotHash,
  }))
  const modelSnapshotRefs: CatalogSnapshotReference[] = snapshotMgr.getAllModelSnapshots().map(s => ({
    catalogId: s.catalogId,
    snapshotHash: s.snapshotHash,
  }))

  const installedStateSnapshotHash = input.installedState.snapshotHash

  // Build semantic projection (deterministic; excludes createdAt, graphId)
  const projection = {
    applicationId: requirementSet.applicationId,
    requirementSetHash: requirementSet.semanticHash,
    policy,
    resolverVersion: RESOLVER_VERSION,
    platformSnapshotHash: input.platform.snapshotHash,
    installedStateSnapshotHash,
    catalogSnapshots: [...capSnapshotRefs, ...langSnapshotRefs, ...modelSnapshotRefs]
      .sort((a, b) => a.catalogId.localeCompare(b.catalogId)),
    nodes: [...nodes].sort((a, b) => a.nodeId.localeCompare(b.nodeId)),
    edges: [...edges].sort((a, b) =>
      a.kind.localeCompare(b.kind) || a.from.localeCompare(b.from) || a.to.localeCompare(b.to)
    ),
    roots: [...rootNodeIds].sort(),
    status: graphStatus,
  }

  const semanticHash = hashGraphProjection(projection)
  const graphId = deriveGraphId(semanticHash)

  const graph: CapabilityResolutionGraph = {
    graphId,
    applicationId: (requirementSet.applicationId ?? 'unknown-app') as ApplicationId,
    requirementSetHash: requirementSet.semanticHash,
    policy,
    resolverVersion: RESOLVER_VERSION,
    platformSnapshotHash: input.platform.snapshotHash,
    installedStateSnapshotHash,
    capabilityCatalogSnapshots: capSnapshotRefs,
    languageCatalogSnapshots: langSnapshotRefs,
    modelCatalogSnapshots: modelSnapshotRefs,
    nodes: Object.freeze(nodes),
    edges: Object.freeze(edges),
    roots: rootNodeIds,
    status: graphStatus,
    semanticHash,
    createdAt: new Date().toISOString() as IsoTimestamp,
  }

  return { status: 'built', graph, diagnostics }
}
