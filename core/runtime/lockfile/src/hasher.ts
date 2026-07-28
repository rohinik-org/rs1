import { createHash } from 'node:crypto'
import { canonicalJson } from './canonicalizer.js'
import type { RohinikLockSemanticHash, RohinikLockAuditHash } from '@rohinik-org/lockfile-ir'

function sha256Hex(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex')
}

export function semanticHash(value: unknown): RohinikLockSemanticHash {
  return sha256Hex(value) as RohinikLockSemanticHash
}

export function auditHash(value: unknown): RohinikLockAuditHash {
  return sha256Hex(value) as RohinikLockAuditHash
}
