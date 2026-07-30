import type { PackageTrustReevaluationTrigger, ReevaluationCandidateQuery } from './types.js'

// Build narrowest deterministic query from trigger
export function buildCandidateQuery(
  trigger: PackageTrustReevaluationTrigger,
  asOf: string,
  limit = 100,
): ReevaluationCandidateQuery {
  const scope = trigger.scope

  // Collect all changed reference IDs by kind
  const policyIds = trigger.changedReferences
    .filter(r => r.referenceKind === 'policy')
    .map(r => r.referenceId)
  const advisoryIds = trigger.changedReferences
    .filter(r => r.referenceKind === 'advisory')
    .map(r => r.referenceId)
  const publisherIds = trigger.changedReferences
    .filter(r => r.referenceKind === 'publisher')
    .map(r => r.referenceId)
  const revocationTargets = trigger.changedReferences
    .filter(r => r.referenceKind === 'revocation')
    .map(r => r.referenceId)

  return {
    packageIds: scope.packageIds?.length ? scope.packageIds : undefined,
    versions: scope.versions?.length ? scope.versions : undefined,
    artifactDigests: scope.artifactDigests?.length ? scope.artifactDigests : undefined,
    policyIds: policyIds.length ? policyIds : (scope.policyIds?.length ? scope.policyIds : undefined),
    advisoryIds: advisoryIds.length ? advisoryIds : undefined,
    publisherIds: publisherIds.length ? publisherIds : undefined,
    revocationTargets: revocationTargets.length ? revocationTargets : undefined,
    tenantIds: scope.tenantIds?.length ? scope.tenantIds : undefined,
    environmentIds: scope.environmentIds?.length ? scope.environmentIds : undefined,
    olderThan: undefined,
    cursor: undefined,
    limit,
    asOf,
  }
}
