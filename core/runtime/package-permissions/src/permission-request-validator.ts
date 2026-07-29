import type { PermissionEvaluationRequest } from './types.js'

export interface ValidationResult {
  readonly valid: boolean
  readonly reason?: string
}

const ISO_8601_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/

export function validatePermissionEvaluationRequest(
  request: unknown,
): ValidationResult {
  if (!request || typeof request !== 'object') {
    return { valid: false, reason: 'request must be an object' }
  }

  const r = request as Partial<PermissionEvaluationRequest>

  if (!r.subject || typeof r.subject !== 'object') {
    return { valid: false, reason: 'subject is required' }
  }

  if (!r.permissionManifest || typeof r.permissionManifest !== 'object') {
    return { valid: false, reason: 'permissionManifest is required' }
  }

  if (!r.executionContext || typeof r.executionContext !== 'object') {
    return { valid: false, reason: 'executionContext is required' }
  }

  if (!r.policy || typeof r.policy !== 'object') {
    return { valid: false, reason: 'policy is required' }
  }

  if (!Array.isArray(r.policy.rules)) {
    return { valid: false, reason: 'policy.rules must be an array' }
  }

  if (typeof r.evaluatedAt !== 'string' || !ISO_8601_RE.test(r.evaluatedAt)) {
    return { valid: false, reason: 'evaluatedAt must be a valid ISO 8601 timestamp' }
  }

  return { valid: true }
}
