import type {
  PackageProvisioningAuthorizationRecord,
  AuthorizationToken,
} from './types.js'
import type { ProvisioningAuthorizationRecordStore } from './ports/index.js'
import { verifyAuthorizationToken } from './authorization-token-builder.js'

export interface TokenVerificationContext {
  readonly token: AuthorizationToken
  readonly tenantId: string
  readonly environmentId: string
  readonly artifactDigest: string
  readonly provisioningMode: string
  readonly currentRepositoryRevision: number
  readonly now: string
}

export interface FullVerificationResult {
  readonly valid: boolean
  readonly record?: PackageProvisioningAuthorizationRecord
  readonly reason?: string
}

export async function verifyAuthorizationTokenFull(
  ctx: TokenVerificationContext,
  store: ProvisioningAuthorizationRecordStore,
): Promise<FullVerificationResult> {
  // Extract authorizationId from token without full parse (first)
  const parts = ctx.token.split('.')
  if (parts.length !== 3) return { valid: false, reason: 'malformed-token' }

  let payload: { authorizationId?: string } | undefined
  try {
    payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString()) as { authorizationId?: string }
  } catch {
    return { valid: false, reason: 'malformed-token' }
  }

  if (!payload?.authorizationId) return { valid: false, reason: 'missing-authorization-id' }

  const record = await store.getById(payload.authorizationId)
  if (!record) return { valid: false, reason: 'missing-authorization-record' }

  const result = verifyAuthorizationToken(ctx.token, record, ctx.currentRepositoryRevision, ctx.now)
  if (!result.valid) {
    const base: FullVerificationResult = { valid: false, record }
    return result.reason !== undefined ? { ...base, reason: result.reason } : base
  }

  // Cross-tenant/environment guard
  if (result.payload!.tenantId !== ctx.tenantId) return { valid: false, reason: 'cross-tenant-replay' }
  if (result.payload!.environmentId !== ctx.environmentId) return { valid: false, reason: 'cross-environment-replay' }

  return { valid: true, record }
}
