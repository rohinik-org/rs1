import type { PackageTrustReevaluationTrigger, TriggerValidationResult } from './types.js'

// L-9J-1205: global scope requires explicit approved authority
const GLOBAL_SCOPE_AUTHORITIES = new Set(['emergency-authority', 'system-policy'])

export function validateTrigger(trigger: PackageTrustReevaluationTrigger): TriggerValidationResult {
  if (!trigger.triggerId || trigger.triggerId.trim() === '') {
    return { valid: false, reason: 'triggerId is required' }
  }
  if (!trigger.triggerType) {
    return { valid: false, reason: 'triggerType is required' }
  }
  if (!trigger.authority) {
    return { valid: false, reason: 'authority is required' }
  }
  if (!trigger.reason || trigger.reason.trim() === '') {
    return { valid: false, reason: 'reason is required' }
  }
  if (!trigger.operationId || trigger.operationId.trim() === '') {
    return { valid: false, reason: 'operationId is required' }
  }
  if (!trigger.occurredAt || !trigger.requestedAt) {
    return { valid: false, reason: 'occurredAt and requestedAt are required' }
  }
  // Validate timestamps are parseable ISO strings
  if (isNaN(Date.parse(trigger.occurredAt))) {
    return { valid: false, reason: 'occurredAt is not a valid ISO timestamp' }
  }
  if (isNaN(Date.parse(trigger.requestedAt))) {
    return { valid: false, reason: 'requestedAt is not a valid ISO timestamp' }
  }
  // L-9J-1205: unbounded global scope requires explicit approved authority
  if (trigger.scope.global === true && !GLOBAL_SCOPE_AUTHORITIES.has(trigger.authority)) {
    return { valid: false, reason: 'global scope requires emergency-authority or system-policy' }
  }
  // policyReference required
  if (!trigger.policyReference?.policyId) {
    return { valid: false, reason: 'policyReference.policyId is required' }
  }
  return { valid: true }
}
