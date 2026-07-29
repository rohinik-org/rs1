import type { RevocationEntry } from '@rohinik-org/package-trust-ir'
import type { RevocationSubject } from './types.js'

export type RecordValidationResult =
  | { valid: true }
  | { valid: false; reason: string }

export function validateRevocationRecord(
  entry: RevocationEntry,
  queriedSubject: RevocationSubject,
): RecordValidationResult {
  if (entry.targetKind !== queriedSubject.targetKind) {
    return { valid: false, reason: `target-kind-mismatch: expected ${queriedSubject.targetKind}, got ${entry.targetKind}` }
  }
  if (entry.targetId !== queriedSubject.targetId) {
    return { valid: false, reason: `target-id-mismatch: expected ${queriedSubject.targetId}, got ${entry.targetId}` }
  }
  if (!entry.targetId || entry.targetId.trim() === '') {
    return { valid: false, reason: 'empty targetId' }
  }
  if (!entry.revokedAt || isNaN(new Date(entry.revokedAt).getTime())) {
    return { valid: false, reason: `invalid revokedAt: ${entry.revokedAt}` }
  }
  if (!entry.reason || entry.reason.trim() === '') {
    return { valid: false, reason: 'missing reason' }
  }
  return { valid: true }
}
