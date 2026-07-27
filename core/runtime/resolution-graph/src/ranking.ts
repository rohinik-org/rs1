import type {
  ResolutionNodeId,
  ResolutionNode,
  CapabilityProviderCandidateNode,
  ProviderSelectionScore,
  ResolutionPolicySnapshot,
} from '@rohinik-org/resolution-graph-ir'

export const TRUST_RANK: Record<string, number> = { unknown: 0, unsigned: 1, signed: 2, verified: 3, official: 4 }

export function scoreCandidate(
  candNodeId: ResolutionNodeId,
  nodeById: Map<ResolutionNodeId, ResolutionNode>,
  policy: ResolutionPolicySnapshot,
): ProviderSelectionScore {
  const cand = nodeById.get(candNodeId) as CapabilityProviderCandidateNode | undefined
  if (!cand) throw new Error(`scoreCandidate: node not found for id '${candNodeId}'`)
  const installedStateRank =
    cand.installState === 'active-installed' ? 0
    : cand.installState === 'inactive-installed' ? 1
    : 2
  const sourceOrder = policy.sourceOrder ?? ['installed', 'local', 'organization', 'marketplace', 'registry', 'direct']
  const sourcePriorityRank = sourceOrder.indexOf(cand.source.kind)
  const normalizedSourceRank = sourcePriorityRank < 0 ? sourceOrder.length : sourcePriorityRank
  // Lower rank = higher trust; invert so lower number wins in ascending sort
  const declaredTrustRank = 4 - (TRUST_RANK[cand.trustClaim.level] ?? 0)
  return {
    installedStateRank,
    sourcePriorityRank: normalizedSourceRank,
    declaredTrustRank,
    constraintSatisfactionRank: 0,
    versionRank: 0,
    dependencyCostRank: 0,
    stableTieBreaker: cand.candidateId,
  }
}

export function compareCandidates(
  a: ResolutionNodeId,
  b: ResolutionNodeId,
  nodeById: Map<ResolutionNodeId, ResolutionNode>,
  policy: ResolutionPolicySnapshot,
): number {
  const sa = scoreCandidate(a, nodeById, policy)
  const sb = scoreCandidate(b, nodeById, policy)
  return (
    sa.installedStateRank - sb.installedStateRank ||
    sa.sourcePriorityRank - sb.sourcePriorityRank ||
    sa.declaredTrustRank - sb.declaredTrustRank ||
    sa.versionRank - sb.versionRank ||
    sa.dependencyCostRank - sb.dependencyCostRank ||
    sa.stableTieBreaker.localeCompare(sb.stableTieBreaker)
  )
}
