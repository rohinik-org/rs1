import type {
  CapabilityConstraint,
  ExecutionLocationConstraint,
  ContextCapacityConstraint,
  FeatureConstraint,
  DataResidencyConstraint,
  LatencyConstraint,
} from '@rohinik-org/capability-contracts-ir'
import type { ApplicationManifestDiagnostic } from '@rohinik-org/application-manifest-ir'

const KNOWN_SHORTHAND_KEYS = new Set([
  'execution',
  'minimumContextTokens', 'minimumContextTokens!',
  'minimumOutputTokens', 'minimumOutputTokens!',
  'mediaTypes',
  'residency',
  'maximumLatencyMs', 'maximumLatencyMs!',
])

export interface ConstraintCompileResult {
  readonly constraints: readonly CapabilityConstraint[]
  readonly diagnostics: readonly ApplicationManifestDiagnostic[]
}

function isPositiveInteger(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v > 0
}

function isNonNegativeInteger(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0
}

export function compileConstraints(
  raw: Record<string, unknown> | undefined,
  path: string,
): ConstraintCompileResult {
  if (!raw) return { constraints: [], diagnostics: [] }

  const constraints: CapabilityConstraint[] = []
  const diagnostics: ApplicationManifestDiagnostic[] = []

  for (const key of Object.keys(raw)) {
    if (!KNOWN_SHORTHAND_KEYS.has(key)) {
      diagnostics.push({ code: 'UNKNOWN_CONSTRAINT_KEY', severity: 'error', message: `Unknown constraint shorthand '${key}' at ${path}.constraints`, path: `${path}.constraints.${key}` })
      continue
    }

    const value = raw[key]

    if (key === 'execution') {
      const HARD_MODES = new Set(['local-only', 'remote-required'])
      const SOFT_MODES = new Set(['local-preferred', 'remote-allowed'])
      if (typeof value !== 'string' || (!HARD_MODES.has(value) && !SOFT_MODES.has(value))) {
        diagnostics.push({ code: 'INVALID_CONSTRAINT_VALUE', severity: 'error', message: `execution must be local-only|local-preferred|remote-allowed|remote-required, got: '${value}'`, path: `${path}.constraints.execution` })
        continue
      }
      constraints.push(Object.freeze({
        kind: 'execution-location',
        mode: value as ExecutionLocationConstraint['mode'],
        hardness: HARD_MODES.has(value) ? 'hard' : 'soft',
      } satisfies ExecutionLocationConstraint))
      continue
    }

    if (key === 'minimumContextTokens' || key === 'minimumContextTokens!') {
      if (!isPositiveInteger(value)) {
        diagnostics.push({ code: 'INVALID_CONSTRAINT_VALUE', severity: 'error', message: `${key} must be a positive integer, got: ${String(value)}`, path: `${path}.constraints.${key}` })
        continue
      }
      constraints.push(Object.freeze({
        kind: 'context-capacity',
        minimumContextTokens: value,
        hardness: key.endsWith('!') ? 'hard' : 'soft',
      } satisfies ContextCapacityConstraint))
      continue
    }

    if (key === 'minimumOutputTokens' || key === 'minimumOutputTokens!') {
      if (!isPositiveInteger(value)) {
        diagnostics.push({ code: 'INVALID_CONSTRAINT_VALUE', severity: 'error', message: `${key} must be a positive integer, got: ${String(value)}`, path: `${path}.constraints.${key}` })
        continue
      }
      constraints.push(Object.freeze({
        kind: 'context-capacity',
        minimumOutputTokens: value,
        hardness: key.endsWith('!') ? 'hard' : 'soft',
      } satisfies ContextCapacityConstraint))
      continue
    }

    if (key === 'mediaTypes') {
      if (!Array.isArray(value) || value.length === 0 || value.some(v => typeof v !== 'string' || v.length === 0)) {
        diagnostics.push({ code: 'INVALID_CONSTRAINT_VALUE', severity: 'error', message: `mediaTypes must be a non-empty array of non-empty strings`, path: `${path}.constraints.mediaTypes` })
        continue
      }
      constraints.push(Object.freeze({
        kind: 'feature',
        requiredFeatures: Object.freeze(value as string[]),
        forbiddenFeatures: Object.freeze([] as string[]),
        hardness: 'hard',
      } satisfies FeatureConstraint))
      continue
    }

    if (key === 'residency') {
      if (!Array.isArray(value) || value.length === 0 || value.some(v => typeof v !== 'string' || v.length === 0)) {
        diagnostics.push({ code: 'INVALID_CONSTRAINT_VALUE', severity: 'error', message: `residency must be a non-empty array of non-empty strings`, path: `${path}.constraints.residency` })
        continue
      }
      constraints.push(Object.freeze({
        kind: 'data-residency',
        allowedRegions: Object.freeze(value as string[]),
      } satisfies DataResidencyConstraint))
      continue
    }

    if (key === 'maximumLatencyMs' || key === 'maximumLatencyMs!') {
      if (!isNonNegativeInteger(value)) {
        diagnostics.push({ code: 'INVALID_CONSTRAINT_VALUE', severity: 'error', message: `${key} must be a non-negative integer (ms), got: ${String(value)}`, path: `${path}.constraints.${key}` })
        continue
      }
      constraints.push(Object.freeze({
        kind: 'latency',
        metric: 'total-response',
        maximumMs: value,
        percentile: 95,
        hardness: key.endsWith('!') ? 'hard' : 'soft',
      } satisfies LatencyConstraint))
      continue
    }
  }

  return { constraints, diagnostics }
}
