import type {
  CapabilityResolutionGraph,
  ProposedCapabilityResolutionPlan,
  ProposedResolutionPlanStatus,
  ResolutionNode,
  ResolutionNodeId,
  CapabilityRequirementNode,
  CapabilityProviderCandidateNode,
  RohinikPackageNode,
  InfrastructureRequirementNode,
  ConfigurationNode,
  SecretRequirementNode,
  PermissionNode,
  ProviderResolution,
  PackageResolution,
  DependencyResolution,
  ModelResolution,
  InfrastructureResolution,
  ConfigurationRequirement,
  SecretResolution,
  PermissionRequest,
  UnresolvedRequirement,
  ResolutionLimitFailure,
  ResolutionConflict,
  ResolutionWarning,
  ResolutionWarningCode,
  InstallationStep,
  InstallationStepId,
  ProviderCandidateId,
  PackageId,
  ResolutionConflictId,
} from '@rohinik-org/resolution-graph-ir'
import type { IsoTimestamp } from '@rohinik-org/capability-contracts-ir'
import { derivePlanId } from './candidate-id.js'
import { hashPlanProjection } from './semantic-hash.js'
import { scoreCandidate, compareCandidates, TRUST_RANK } from './ranking.js'

export async function solve(graph: CapabilityResolutionGraph): Promise<ProposedCapabilityResolutionPlan> {
  // pure read-only — no catalog calls, no graph mutation
  const policy = graph.policy

  const nodeById = new Map<ResolutionNodeId, ResolutionNode>()
  for (const node of graph.nodes) nodeById.set(node.nodeId, node)

  // candidateNodeId → reqNodeId (eligible candidates only)
  const candidatesForReq = new Map<ResolutionNodeId, ResolutionNodeId[]>()
  // candNodeId → pkgNodeId
  const implementedBy = new Map<ResolutionNodeId, ResolutionNodeId>()

  for (const edge of graph.edges) {
    if (edge.kind === 'candidate-for' && edge.eligibility === 'eligible') {
      const list = candidatesForReq.get(edge.to) ?? []
      list.push(edge.from)
      candidatesForReq.set(edge.to, list)
    }
    if (edge.kind === 'implemented-by') {
      implementedBy.set(edge.from, edge.to)
    }
  }

  const warnings: ResolutionWarning[] = []

  const rootReqNodes = graph.roots
    .map(id => {
      const node = nodeById.get(id)
      if (!node || node.kind !== 'capability-requirement') {
        warnings.push({ code: 'ROOT_NODE_NOT_FOUND' as ResolutionWarningCode, message: `Root node '${id}' not found or not a capability-requirement`, affectedNodeIds: [id] })
        return undefined
      }
      return node as CapabilityRequirementNode
    })
    .filter((n): n is CapabilityRequirementNode => n !== undefined)

  const requiredReqs = rootReqNodes.filter(n => n.necessity === 'required')
  const optionalReqs = rootReqNodes.filter(n => n.necessity === 'optional')

  const selectedCandidates = new Map<ResolutionNodeId, ResolutionNodeId>() // reqNodeId → candNodeId
  const ineligibleCandidates = new Set<ResolutionNodeId>()
  const conflicts: ResolutionConflict[] = []
  const limitFailures: ResolutionLimitFailure[] = []
  let backtrackCount = 0

  function isIneligible(candId: ResolutionNodeId): boolean {
    const cand = nodeById.get(candId) as CapabilityProviderCandidateNode | undefined
    if (!cand || cand.kind !== 'capability-provider-candidate') return true

    if (policy.denyList?.includes(cand.packageId)) return true

    const trustRank = TRUST_RANK[cand.trustClaim.level] ?? 0
    const minRank = TRUST_RANK[policy.minimumDeclaredTrustLevel] ?? 0
    if (trustRank < minRank) return true

    const pkgNodeId = implementedBy.get(candId)
    if (pkgNodeId) {
      for (const edge of graph.edges) {
        if (edge.kind === 'requires-platform' && edge.from === pkgNodeId) {
          const platNode = nodeById.get(edge.to)
          if (platNode?.kind === 'platform-requirement' && platNode.assessment === 'unsatisfied') return true
        }
        if (edge.kind === 'requires-perm' && edge.from === pkgNodeId) {
          const permNode = nodeById.get(edge.to)
          if (permNode?.kind === 'permission' && permNode.required && permNode.policyAssessment === 'denied') return true
        }
      }
    }
    return false
  }

  // Pre-populate ineligibleCandidates via constraint propagation
  for (const reqNode of [...requiredReqs, ...optionalReqs]) {
    for (const candId of (candidatesForReq.get(reqNode.nodeId) ?? [])) {
      if (isIneligible(candId)) ineligibleCandidates.add(candId)
    }
  }

  function hasVersionConflict(newCandId: ResolutionNodeId): boolean {
    const newCand = nodeById.get(newCandId) as CapabilityProviderCandidateNode | undefined
    if (!newCand || newCand.kind !== 'capability-provider-candidate') return false
    for (const selCandId of selectedCandidates.values()) {
      const selCand = nodeById.get(selCandId) as CapabilityProviderCandidateNode | undefined
      if (!selCand || selCand.kind !== 'capability-provider-candidate') continue
      if (selCand.packageId === newCand.packageId && selCand.providerVersion !== newCand.providerVersion) return true
    }
    return false
  }

  const unresolvedRequirements: UnresolvedRequirement[] = []

  // §11 step 2: fewest eligible candidates first, tie-break capabilityId then requirementId
  requiredReqs.sort((a, b) => {
    const countA = (candidatesForReq.get(a.nodeId) ?? []).filter(id => !ineligibleCandidates.has(id)).length
    const countB = (candidatesForReq.get(b.nodeId) ?? []).filter(id => !ineligibleCandidates.has(id)).length
    return countA - countB || a.capabilityId.localeCompare(b.capabilityId) || a.requirementId.localeCompare(b.requirementId)
  })

  for (const reqNode of requiredReqs) {
    if (backtrackCount >= policy.maximumBacktrackingSteps) {
      limitFailures.push({
        kind: 'max-backtracking-steps',
        bound: policy.maximumBacktrackingSteps,
        reached: backtrackCount,
        summary: `Backtracking limit of ${policy.maximumBacktrackingSteps} exceeded`,
      })
      break
    }

    const eligibleCandidates = (candidatesForReq.get(reqNode.nodeId) ?? [])
      .filter(id => !ineligibleCandidates.has(id))
      .sort((a, b) => compareCandidates(a, b, nodeById, policy))

    if (eligibleCandidates.length === 0) {
      unresolvedRequirements.push({
        requirementId: reqNode.requirementId,
        capabilityId: reqNode.capabilityId,
        necessity: 'required',
        reason: 'no-provider-found',
        summary: `No eligible provider found for '${reqNode.capabilityId}'`,
        conflictingNodes: [],
        evidence: [{ description: `No eligible candidates for ${reqNode.capabilityId} ${reqNode.versionRange}`, nodeIds: [reqNode.nodeId] }],
        suggestions: [{ description: 'Check that at least one provider catalog is configured' }],
      })
      continue
    }

    let resolved = false
    for (const candId of eligibleCandidates) {
      if (hasVersionConflict(candId)) {
        const cand = nodeById.get(candId) as CapabilityProviderCandidateNode
        backtrackCount++
        conflicts.push({
          conflictId: `conflict-${backtrackCount}` as ResolutionConflictId,
          code: 'RESOLUTION_VERSION_CONFLICT',
          severity: 'error',
          nodeIds: [reqNode.nodeId, candId],
          packageIds: [cand.packageId],
          capabilityIds: [reqNode.capabilityId],
          versionRequirements: [],
          summary: `Version conflict for package '${cand.packageId}'`,
          evidence: [{ description: `Package '${cand.packageId}' has conflicting version requirements`, nodeIds: [reqNode.nodeId, candId] }],
          suggestions: [{ description: 'Align version requirements across all dependencies' }],
        })
        ineligibleCandidates.add(candId)
        if (backtrackCount >= policy.maximumBacktrackingSteps) break
        continue
      }
      selectedCandidates.set(reqNode.nodeId, candId)
      resolved = true
      break
    }

    if (!resolved && backtrackCount < policy.maximumBacktrackingSteps) {
      unresolvedRequirements.push({
        requirementId: reqNode.requirementId,
        capabilityId: reqNode.capabilityId,
        necessity: 'required',
        reason: 'version-conflict',
        summary: `All candidates for '${reqNode.capabilityId}' have conflicting constraints`,
        conflictingNodes: [reqNode.nodeId],
        evidence: [{ description: 'Version conflict prevented selection of any candidate', nodeIds: [reqNode.nodeId] }],
        suggestions: [{ description: 'Review package version constraints' }],
      })
    }
  }

  if (policy.optionalRequirementMode !== 'ignore') {
    for (const reqNode of optionalReqs) {
      const eligibleCandidates = (candidatesForReq.get(reqNode.nodeId) ?? [])
        .filter(id => !ineligibleCandidates.has(id))
        .sort((a, b) => compareCandidates(a, b, nodeById, policy))
      if (eligibleCandidates.length === 0) {
        warnings.push({
          code: 'OPTIONAL_REQUIREMENT_UNRESOLVED',
          message: `Optional capability '${reqNode.capabilityId}' could not be resolved`,
          affectedNodeIds: [reqNode.nodeId],
        })
        continue
      }
      for (const candId of eligibleCandidates) {
        if (!hasVersionConflict(candId)) {
          selectedCandidates.set(reqNode.nodeId, candId)
          break
        }
      }
    }
  }

  let planStatus: ProposedResolutionPlanStatus
  if (limitFailures.length > 0) {
    planStatus = 'limit-exceeded'
  } else if (conflicts.some(c => c.severity === 'error')) {
    planStatus = 'conflict'
  } else if (unresolvedRequirements.some(u => u.necessity === 'required')) {
    planStatus = 'unsatisfiable'
  } else if (warnings.some(w => w.code === 'OPTIONAL_REQUIREMENT_UNRESOLVED')) {
    planStatus = 'partial'
  } else {
    planStatus = 'proposed'
  }

  const selectedProviders: ProviderResolution[] = []
  const packagesToInstall: PackageResolution[] = []
  const dependenciesToInstall: DependencyResolution[] = []
  const modelArtifacts: ModelResolution[] = []
  const infrastructureActions: InfrastructureResolution[] = []
  const configurationRequirements: ConfigurationRequirement[] = []
  const secretRequirements: SecretResolution[] = []
  const permissionsToRequest: PermissionRequest[] = []
  const processedPackages = new Set<string>()

  for (const [reqNodeId, candNodeId] of selectedCandidates) {
    const reqNode = nodeById.get(reqNodeId) as CapabilityRequirementNode | undefined
    const cand = nodeById.get(candNodeId) as CapabilityProviderCandidateNode | undefined
    if (!reqNode || !cand) continue

    // alternatives = other eligible candidateIds for this requirement
    const allEligibleNodeIds = (candidatesForReq.get(reqNodeId) ?? []).filter(id => !ineligibleCandidates.has(id))
    const alternatives: ProviderCandidateId[] = allEligibleNodeIds
      .filter(id => id !== candNodeId)
      .map(id => (nodeById.get(id) as CapabilityProviderCandidateNode | undefined)?.candidateId)
      .filter((id): id is ProviderCandidateId => id !== undefined)

    selectedProviders.push({
      requirementId: reqNode.requirementId,
      selectedCandidateId: cand.candidateId,
      providerId: cand.providerId,
      packageId: cand.packageId,
      capabilityVersion: cand.capabilityVersion,
      selectionScore: scoreCandidate(candNodeId, nodeById, policy),
      alternatives,
    })

    const pkgKey = `${cand.packageId as string}@${cand.providerVersion}`
    if (!processedPackages.has(pkgKey)) {
      processedPackages.add(pkgKey)
      const pkgNodeId = implementedBy.get(candNodeId)
      const pkgNode = pkgNodeId ? nodeById.get(pkgNodeId) as RohinikPackageNode | undefined : undefined
      if (pkgNode?.installState === 'to-install') {
        packagesToInstall.push({
          packageId: cand.packageId,
          resolvedVersion: cand.providerVersion,
          source: cand.source,
          ...(pkgNode.claimedIntegrity !== undefined && { claimedIntegrity: pkgNode.claimedIntegrity }),
          introducedBy: [reqNodeId],
        })
      }

      if (pkgNodeId) {
        for (const edge of graph.edges) {
          if (edge.from !== pkgNodeId) continue
          const target = nodeById.get(edge.to)
          if (!target) continue

          if (edge.kind === 'requires-infra' && target.kind === 'infrastructure-requirement') {
            const infra = target as InfrastructureRequirementNode
            if (!infrastructureActions.find(a => a.serviceId === infra.serviceId)) {
              infrastructureActions.push({
                serviceId: infra.serviceId,
                serviceType: infra.serviceType,
                proposedAction: infra.allowedStrategies[0] ?? 'provision-embedded',
                requiredBy: [pkgNodeId],
              })
            }
          }

          if (edge.kind === 'requires-config' && target.kind === 'configuration') {
            const cfg = target as ConfigurationNode
            if (!configurationRequirements.find(c => c.configurationKey === cfg.configurationKey)) {
              configurationRequirements.push({
                configurationKey: cfg.configurationKey,
                required: cfg.required,
                valueType: cfg.valueType,
                requiredByPackageIds: cfg.requiredByPackageIds,
                ...(cfg.defaultValue !== undefined && { defaultValue: cfg.defaultValue }),
              })
            }
          }

          if (edge.kind === 'requires-secret' && target.kind === 'secret-requirement') {
            const sec = target as SecretRequirementNode
            if (!secretRequirements.find(s => s.secretName === sec.secretName)) {
              secretRequirements.push({
                secretName: sec.secretName,
                required: !sec.optional,
                purpose: sec.purpose,
                requiredByPackageIds: sec.requiredByPackageIds,
              })
            }
          }

          if (edge.kind === 'requires-perm' && target.kind === 'permission') {
            const perm = target as PermissionNode
            permissionsToRequest.push({
              permissionName: perm.permissionName,
              required: perm.required,
              requiredByPackageId: cand.packageId,
              justification: '',
              policyAssessment: perm.policyAssessment,
            })
          }
        }
      }
    }
  }

  const installationOrder: InstallationStep[] = []
  let stepCounter = 0
  for (const pkg of packagesToInstall) {
    installationOrder.push({
      stepId: `step-${++stepCounter}` as InstallationStepId,
      kind: 'rohinik-package',
      targetId: `${pkg.packageId as string}@${pkg.resolvedVersion}`,
      dependsOn: [],
    })
  }
  for (const infra of infrastructureActions) {
    installationOrder.push({
      stepId: `step-${++stepCounter}` as InstallationStepId,
      kind: 'infrastructure',
      targetId: infra.serviceId,
      dependsOn: [],
    })
  }

  const planProjection = {
    graphId: graph.graphId,
    applicationId: graph.applicationId,
    status: planStatus,
    selectedProviders: [...selectedProviders]
      .sort((a, b) => a.requirementId.localeCompare(b.requirementId))
      .map(p => ({
        requirementId: p.requirementId,
        selectedCandidateId: p.selectedCandidateId,
        capabilityVersion: p.capabilityVersion,
        alternatives: [...p.alternatives].sort(),
      })),
    packagesToInstall: [...packagesToInstall]
      .sort((a, b) => (a.packageId as string).localeCompare(b.packageId as string))
      .map(p => ({ packageId: p.packageId, resolvedVersion: p.resolvedVersion, source: p.source })),
    unresolvedRequirements: [...unresolvedRequirements]
      .sort((a, b) => a.requirementId.localeCompare(b.requirementId))
      .map(u => ({ requirementId: u.requirementId, reason: u.reason })),
    limitFailures: [...limitFailures].sort((a, b) => a.kind.localeCompare(b.kind)),
    installationOrder: installationOrder.map(s => ({ kind: s.kind, targetId: s.targetId })),
  }

  const semanticHash = hashPlanProjection(planProjection)
  const planId = derivePlanId(semanticHash)

  return {
    planId,
    graphId: graph.graphId,
    applicationId: graph.applicationId,
    status: planStatus,
    selectedProviders,
    packagesToInstall,
    dependenciesToInstall,
    modelArtifacts,
    infrastructureActions,
    configurationRequirements,
    secretRequirements,
    permissionsToRequest,
    unresolvedRequirements,
    limitFailures,
    conflicts,
    warnings,
    installationOrder,
    semanticHash,
    createdAt: new Date().toISOString() as IsoTimestamp,
  }
}
