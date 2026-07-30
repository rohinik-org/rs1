import { createHash, createHmac } from 'node:crypto'
import type {
  PackageProvisioningAuthorizationDecision,
  PackageProvisioningAuthorizationRecord,
  AuthorizationToken,
  AuthorizationLifecycleState,
} from './types.js'

const TOKEN_VERSION = 'v1'
const HMAC_SECRET = Buffer.from('rhk-provisioning-auth-token-key-2026', 'utf8')

export interface TokenPayload {
  readonly version: string
  readonly authorizationId: string
  readonly requestId: string
  readonly operationId: string
  readonly packageId: string
  readonly version_: string
  readonly artifactDigest: string
  readonly tenantId: string
  readonly environmentId: string
  readonly provisioningMode: string
  readonly repositoryRevision: number
  readonly policyId: string
  readonly policyVersion: string
  readonly issuedAt: string
  readonly expiresAt?: string
  readonly singleUse: boolean
  readonly outcome: string
}

export function buildAuthorizationToken(decision: PackageProvisioningAuthorizationDecision, singleUse: boolean): AuthorizationToken {
  const payload: TokenPayload = {
    version:            TOKEN_VERSION,
    authorizationId:    decision.authorizationId,
    requestId:          decision.requestId,
    operationId:        decision.operationId,
    packageId:          decision.subject.packageId,
    version_:           decision.subject.version,
    artifactDigest:     decision.artifactIdentity.artifactDigest,
    tenantId:           decision.tenantId,
    environmentId:      decision.environmentId,
    provisioningMode:   decision.provisioningMode,
    repositoryRevision: decision.repositoryRevision,
    policyId:           decision.policyReference.policyId,
    policyVersion:      decision.policyReference.policyVersion,
    issuedAt:           decision.issuedAt,
    singleUse,
    outcome:            decision.outcome,
    ...(decision.expiresAt !== undefined && { expiresAt: decision.expiresAt }),
  }

  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig  = createHmac('sha256', HMAC_SECRET).update(body).digest('base64url')
  return `${TOKEN_VERSION}.${body}.${sig}` as AuthorizationToken
}

export function computeTokenDigest(token: AuthorizationToken): string {
  return createHash('sha256').update(token).digest('hex')
}

export interface TokenVerificationResult {
  readonly valid: boolean
  readonly payload?: TokenPayload
  readonly reason?: string
}

export function verifyAuthorizationToken(
  token: AuthorizationToken,
  record: PackageProvisioningAuthorizationRecord,
  currentRepositoryRevision: number,
  now: string,
): TokenVerificationResult {
  const parts = token.split('.')
  if (parts.length !== 3 || parts[0] !== TOKEN_VERSION) {
    return { valid: false, reason: 'unsupported-token-version' }
  }

  const [version, body, sig] = parts as [string, string, string]
  const expected = createHmac('sha256', HMAC_SECRET).update(body).digest('base64url')
  if (sig !== expected) {
    return { valid: false, reason: 'tampered-token' }
  }

  let payload: TokenPayload
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as TokenPayload
  } catch {
    return { valid: false, reason: 'malformed-token' }
  }

  if (payload.authorizationId !== record.authorizationId)
    return { valid: false, reason: 'authorization-id-mismatch' }
  if (payload.artifactDigest !== record.artifactIdentity.artifactDigest)
    return { valid: false, reason: 'artifact-mismatch' }
  if (payload.tenantId !== record.tenantId)
    return { valid: false, reason: 'tenant-mismatch' }
  if (payload.environmentId !== record.environmentId)
    return { valid: false, reason: 'environment-mismatch' }
  if (payload.provisioningMode !== record.provisioningMode)
    return { valid: false, reason: 'mode-mismatch' }
  if (payload.repositoryRevision !== record.repositoryRevision)
    return { valid: false, reason: 'revision-mismatch' }

  // State checks
  const nonUsableStates: AuthorizationLifecycleState[] = ['CONSUMED','EXPIRED','INVALIDATED','SUPERSEDED','DENIED','FAILED','DEFERRED','MANUAL_REVIEW_REQUIRED']
  if (nonUsableStates.includes(record.state))
    return { valid: false, reason: `state-${record.state.toLowerCase()}` }

  // Expiry
  if (payload.expiresAt !== undefined && now >= payload.expiresAt)
    return { valid: false, reason: 'expired' }
  if (record.expiresAt !== undefined && now >= record.expiresAt)
    return { valid: false, reason: 'expired' }

  // Stale revision
  if (currentRepositoryRevision > record.repositoryRevision + 1) {
    return { valid: false, reason: 'stale-revision' }
  }

  return { valid: true, payload }
}
