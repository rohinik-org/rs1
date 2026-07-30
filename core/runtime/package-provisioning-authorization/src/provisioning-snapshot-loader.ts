import type {
  PackageProvisioningAuthorizationRequest,
  PackageProvisioningTrustSnapshot,
} from './types.js'
import { AuthorizationError } from './types.js'
import type { ProvisioningTrustRepositoryReader } from './ports/index.js'

export async function loadProvisioningSnapshot(
  req: PackageProvisioningAuthorizationRequest,
  reader: ProvisioningTrustRepositoryReader,
): Promise<PackageProvisioningTrustSnapshot> {
  let snapshot: PackageProvisioningTrustSnapshot | undefined
  try {
    snapshot = await reader.getProvisioningTrustSnapshot({
      packageId:       req.subject.packageId,
      version:         req.subject.version,
      artifactDigest:  req.artifactIdentity.artifactDigest,
      tenantId:        req.tenantId,
      environmentId:   req.environmentId,
      asOf:            req.requestedAt,
    })
  } catch (err) {
    // Distinguish repo failure from missing record (L-9J-1327)
    throw new AuthorizationError(
      'repository-failure',
      `Trust repository unavailable: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  if (!snapshot) {
    throw new AuthorizationError('missing-trust-record', `No trust record found for ${req.subject.packageId}@${req.subject.version}`)
  }

  // Subject match
  if (snapshot.subject.packageId !== req.subject.packageId)
    throw new AuthorizationError('subject-mismatch', 'Snapshot subject packageId does not match request')
  if (snapshot.subject.version !== req.subject.version)
    throw new AuthorizationError('subject-mismatch', 'Snapshot subject version does not match request')

  // Artifact match
  if (snapshot.artifactIdentity.artifactDigest !== req.artifactIdentity.artifactDigest)
    throw new AuthorizationError('artifact-mismatch', 'Snapshot artifact digest does not match request')

  // Stale revision check
  if (req.expectedRepositoryRevision !== undefined &&
      req.expectedRepositoryRevision !== snapshot.repositoryRevision) {
    throw new AuthorizationError('stale-snapshot', `Expected revision ${req.expectedRepositoryRevision} but snapshot is at ${snapshot.repositoryRevision}`)
  }

  if (snapshot.superseded || !snapshot.current) {
    throw new AuthorizationError('stale-snapshot', 'Trust record is superseded or not current')
  }

  return snapshot
}
