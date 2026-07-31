import { createHash } from 'node:crypto'
import type { SealedExecutionEvidence } from './index.js'

// Canonical projection for content hash computation.
// Excluded: evidenceHash (self-referential), producedAt (repository metadata).
// Dates serialized as ISO strings. Object keys sorted recursively.
// Optional absent fields omitted (not serialized as null/undefined).
function canonicalize(value: unknown): unknown {
  if (value === null || value === undefined) return value
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(canonicalize)
  if (typeof value === 'object') {
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(value as object).sort()) {
      const v = (value as Record<string, unknown>)[key]
      if (v !== undefined) sorted[key] = canonicalize(v)
    }
    return sorted
  }
  return value
}

function projectForHash(record: SealedExecutionEvidence): Record<string, unknown> {
  // Destructure to exclude evidenceHash and producedAt from the canonical projection.
  const {
    evidenceHash: _eh,  // excluded: self-referential
    producedAt:   _pa,  // excluded: repository metadata
    ...rest
  } = record as SealedExecutionEvidence & Record<string, unknown>
  return rest
}

export function computeEvidenceHash(record: SealedExecutionEvidence): string {
  const projected = projectForHash(record)
  const canonical = JSON.stringify(canonicalize(projected))
  return createHash('sha256').update(canonical).digest('hex')
}

export function verifyEvidenceHash(record: SealedExecutionEvidence): boolean {
  return computeEvidenceHash(record) === record.evidenceHash
}
