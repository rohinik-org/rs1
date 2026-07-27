import { createHash } from 'node:crypto'
import type { ResolutionGraphSemanticHash, ResolutionPlanSemanticHash } from '@rohinik-org/resolution-graph-ir'

// ponytail: sort-and-stringify is sufficient for determinism; full canonical form deferred to §6 spec if divergence is found
function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return '[' + value.map(canonicalStringify).join(',') + ']'
  const keys = Object.keys(value as object).sort()
  const pairs = keys
    .filter(k => (value as Record<string, unknown>)[k] !== undefined)
    .map(k => `${JSON.stringify(k)}:${canonicalStringify((value as Record<string, unknown>)[k])}`)
  return '{' + pairs.join(',') + '}'
}

export function hashGraphProjection(projection: unknown): ResolutionGraphSemanticHash {
  const json = canonicalStringify(projection)
  return createHash('sha256').update(json, 'utf8').digest('hex') as ResolutionGraphSemanticHash
}

export function hashPlanProjection(projection: unknown): ResolutionPlanSemanticHash {
  const json = canonicalStringify(projection)
  return createHash('sha256').update(json, 'utf8').digest('hex') as ResolutionPlanSemanticHash
}
