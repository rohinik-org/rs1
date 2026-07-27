import { createHash } from 'node:crypto'
import type {
  ProviderCandidateId,
  CatalogSnapshotHash,
  PackageId,
  CapabilityId,
  ResolutionGraphId,
  ResolutionGraphSemanticHash,
  ResolutionPlanId,
  ResolutionPlanSemanticHash,
  ResolutionNodeId,
} from '@rohinik-org/resolution-graph-ir'

interface DeriveCandidateIdParams {
  readonly catalogSnapshotHash: CatalogSnapshotHash
  readonly providerId: string
  readonly packageId: PackageId
  readonly packageVersion: string
  readonly capabilityId: CapabilityId
  readonly capabilityVersion: string
  readonly sourceId: string
  readonly artifactId: string
}

// Derives candidateId from AFS-0108 §4.2 formula.
// No external ID may be used directly as a canonical resolver identity.
export function deriveCandidateId(params: DeriveCandidateIdParams): ProviderCandidateId {
  const input = [
    'provider-candidate',
    params.catalogSnapshotHash,
    params.providerId,
    params.packageId,
    params.packageVersion,
    params.capabilityId,
    params.capabilityVersion,
    params.sourceId,
    params.artifactId,
  ].join('|')
  return createHash('sha256').update(input, 'utf8').digest('hex') as ProviderCandidateId
}

export function deriveGraphId(semanticHash: ResolutionGraphSemanticHash): ResolutionGraphId {
  return `rg-${semanticHash.slice(0, 16)}` as ResolutionGraphId
}

export function derivePlanId(semanticHash: ResolutionPlanSemanticHash): ResolutionPlanId {
  return `rp-${semanticHash.slice(0, 16)}` as ResolutionPlanId
}

export function deriveNodeId(prefix: string, content: string): ResolutionNodeId {
  const hash = createHash('sha256').update(`${prefix}|${content}`, 'utf8').digest('hex')
  return `${prefix}-${hash.slice(0, 16)}` as ResolutionNodeId
}
