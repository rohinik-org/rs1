import type { PackageQuarantineRequest, ValidationResult } from './types.js'

const VALID_DECISIONS = new Set(['trusted', 'conditionally-trusted', 'quarantined', 'manual-review-required', 'denied'])

export function validateQuarantineRequest(request: PackageQuarantineRequest): ValidationResult {
  if (!request.subject) return { valid: false, reason: 'subject is required' }
  if (!request.subject.packageId) return { valid: false, reason: 'subject.packageId is required' }
  if (!request.subject.version) return { valid: false, reason: 'subject.version is required' }
  if (!request.trustDecision) return { valid: false, reason: 'trustDecision is required' }
  if (!VALID_DECISIONS.has(request.trustDecision)) return { valid: false, reason: `unsupported trustDecision: ${request.trustDecision}` }
  if (!request.artifact) return { valid: false, reason: 'artifact is required' }
  if (!request.artifact.artifactId) return { valid: false, reason: 'artifact.artifactId is required' }
  if (!request.artifact.sourceLocation) return { valid: false, reason: 'artifact.sourceLocation is required' }
  if (request.artifact.sourceLocation.includes('..')) return { valid: false, reason: 'artifact.sourceLocation must not contain ..' }
  if (!request.policy) return { valid: false, reason: 'policy is required' }
  if (!request.policy.allowedModes || request.policy.allowedModes.length === 0) return { valid: false, reason: 'policy.allowedModes must not be empty' }
  if (!request.policy.defaultMode) return { valid: false, reason: 'policy.defaultMode is required' }
  if (!request.policy.allowedModes.includes(request.policy.defaultMode)) return { valid: false, reason: 'policy.defaultMode must be in allowedModes' }
  if (!request.context) return { valid: false, reason: 'context is required' }
  if (!request.operationId) return { valid: false, reason: 'operationId is required' }
  if (!request.requestedAt) return { valid: false, reason: 'requestedAt is required' }
  if (isNaN(Date.parse(request.requestedAt))) return { valid: false, reason: 'requestedAt must be a valid ISO timestamp' }
  return { valid: true }
}
