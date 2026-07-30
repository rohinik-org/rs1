import { createHash } from 'node:crypto'
import type {
  PackageProvisioningAuthorizationRequest,
  PackageProvisioningAuthorizationDecision,
  PackageProvisioningAuthorizationRecord,
  PackageProvisioningAuthorizationOutcome,
  AuthorizationReason,
  ProvisioningAuthorizationCondition,
  RequestedCapability,
  RequestedPermission,
  AuthorizationLifecycleState,
  AuthorizationId,
} from './types.js'

export function computeAuthorizationId(
  req: PackageProvisioningAuthorizationRequest,
  repositoryRevision: number,
): string {
  const identity = {
    packageId:           req.subject.packageId,
    version:             req.subject.version,
    artifactDigest:      req.artifactIdentity.artifactDigest,
    tenantId:            req.tenantId,
    environmentId:       req.environmentId,
    provisioningMode:    req.provisioningMode,
    capabilityHash:      computeScopeHash(req.requestedCapabilities.map(c => c.capabilityId).sort()),
    permissionHash:      computeScopeHash(req.requestedPermissions.map(p => p.permissionId).sort()),
    policyId:            req.policyReference.policyId,
    policyVersion:       req.policyReference.policyVersion,
    repositoryRevision,
  }
  return createHash('sha256').update(JSON.stringify(identity)).digest('hex').slice(0, 32)
}

function computeScopeHash(ids: string[]): string {
  return createHash('sha256').update(ids.join(',')).digest('hex').slice(0, 16)
}

export function buildAuthorizationDecision(
  req: PackageProvisioningAuthorizationRequest,
  outcome: PackageProvisioningAuthorizationOutcome,
  reasons: readonly AuthorizationReason[],
  conditions: readonly ProvisioningAuthorizationCondition[],
  authorizedCapabilities: readonly RequestedCapability[],
  authorizedPermissions: readonly RequestedPermission[],
  trustDecisionRecordId: string,
  repositoryRevision: number,
  issuedAt: string,
  expiresAt?: string,
): PackageProvisioningAuthorizationDecision {
  const authorizationId = computeAuthorizationId(req, repositoryRevision)
  const base = {
    authorizationId,
    requestId:              req.requestId,
    operationId:            req.operationId,
    outcome,
    subject:                req.subject,
    artifactIdentity:       req.artifactIdentity,
    tenantId:               req.tenantId,
    environmentId:          req.environmentId,
    provisioningMode:       req.provisioningMode,
    authorizedCapabilities,
    authorizedPermissions,
    conditions,
    reasons,
    trustDecisionRecordId,
    repositoryRevision,
    policyReference:        req.policyReference,
    issuedAt,
  }
  return expiresAt !== undefined ? { ...base, expiresAt } : base
}

export function decisionToRecord(
  decision: PackageProvisioningAuthorizationDecision,
  state: AuthorizationLifecycleState,
): PackageProvisioningAuthorizationRecord {
  const base = {
    authorizationId:        decision.authorizationId,
    requestId:              decision.requestId,
    operationId:            decision.operationId,
    state,
    outcome:                decision.outcome,
    subject:                decision.subject,
    artifactIdentity:       decision.artifactIdentity,
    tenantId:               decision.tenantId,
    environmentId:          decision.environmentId,
    provisioningMode:       decision.provisioningMode,
    authorizedCapabilities: decision.authorizedCapabilities,
    authorizedPermissions:  decision.authorizedPermissions,
    conditions:             decision.conditions,
    reasons:                decision.reasons,
    trustDecisionRecordId:  decision.trustDecisionRecordId,
    repositoryRevision:     decision.repositoryRevision,
    policyReference:        decision.policyReference,
    issuedAt:               decision.issuedAt,
  }
  return decision.expiresAt !== undefined ? { ...base, expiresAt: decision.expiresAt } : base
}
