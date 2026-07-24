import semver from 'semver'
import type { VersionRange, VersionRangeExpression } from '@rohinik-org/capability-contracts-ir'

// §8 — parseVersionRange. Uses node-semver (pinned in package.json).
// Prerelease policy: default { includePrerelease: false }.
export function parseVersionRange(expression: string): VersionRange {
  const normalized = semver.validRange(expression, { includePrerelease: false })
  if (normalized === null) {
    throw new Error(`Invalid version range: '${expression}'`)
  }
  return {
    expression,
    normalized: normalized as VersionRangeExpression,
  }
}
