import type { PackageProvisioningAuthorizationRequest } from './types.js'
import { AuthorizationError } from './types.js'

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/
const MAX_CAPABILITIES = 100
const MAX_PERMISSIONS  = 100

function isValidISO(ts: string): boolean { return ISO_RE.test(ts) }
function isNonEmpty(s: string): boolean { return typeof s === 'string' && s.trim().length > 0 }

export function validateProvisioningRequest(req: PackageProvisioningAuthorizationRequest): void {
  if (!isNonEmpty(req.requestId))    throw new AuthorizationError('invalid-request', 'requestId is required')
  if (!isNonEmpty(req.operationId))  throw new AuthorizationError('invalid-request', 'operationId is required')
  if (!isNonEmpty(req.tenantId))     throw new AuthorizationError('invalid-request', 'tenantId is required')
  if (!isNonEmpty(req.environmentId))throw new AuthorizationError('invalid-request', 'environmentId is required')
  if (!isNonEmpty(req.packageVersion))throw new AuthorizationError('invalid-request', 'packageVersion is required')

  if (!req.subject || !isNonEmpty(req.subject.packageId))
    throw new AuthorizationError('invalid-request', 'subject.packageId is required')
  if (!isNonEmpty(req.subject.version))
    throw new AuthorizationError('invalid-request', 'subject.version is required')
  if (!req.subject.sourceIdentity)
    throw new AuthorizationError('invalid-request', 'subject.sourceIdentity is required')
  if (!req.subject.expectedIntegrity)
    throw new AuthorizationError('invalid-request', 'subject.expectedIntegrity is required')

  if (!req.artifactIdentity || !isNonEmpty(req.artifactIdentity.artifactDigest))
    throw new AuthorizationError('invalid-request', 'artifactIdentity.artifactDigest is required')
  if (!isNonEmpty(req.artifactIdentity.packageId))
    throw new AuthorizationError('invalid-request', 'artifactIdentity.packageId is required')

  const validModes = ['install','upgrade','downgrade','repair','restore','dependency-install','manual-recovery']
  if (!validModes.includes(req.provisioningMode))
    throw new AuthorizationError('invalid-request', `Invalid provisioningMode: ${req.provisioningMode}`)

  if (!isValidISO(req.requestedAt))
    throw new AuthorizationError('invalid-request', 'requestedAt must be a valid ISO 8601 UTC timestamp')

  if (!req.policyReference || !isNonEmpty(req.policyReference.policyId))
    throw new AuthorizationError('invalid-request', 'policyReference.policyId is required')
  if (!isNonEmpty(req.policyReference.policyVersion))
    throw new AuthorizationError('invalid-request', 'policyReference.policyVersion is required')

  if (req.requestedCapabilities.length > MAX_CAPABILITIES)
    throw new AuthorizationError('invalid-request', `requestedCapabilities exceeds maximum ${MAX_CAPABILITIES}`)
  if (req.requestedPermissions.length > MAX_PERMISSIONS)
    throw new AuthorizationError('invalid-request', `requestedPermissions exceeds maximum ${MAX_PERMISSIONS}`)

  const capIds = req.requestedCapabilities.map(c => c.capabilityId)
  if (new Set(capIds).size !== capIds.length)
    throw new AuthorizationError('invalid-request', 'requestedCapabilities contains duplicates')

  const permIds = req.requestedPermissions.map(p => `${p.permissionId}:${p.permissionScope ?? ''}`)
  if (new Set(permIds).size !== permIds.length)
    throw new AuthorizationError('invalid-request', 'requestedPermissions contains duplicates')
}
