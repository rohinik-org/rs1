import type { Stage9JConstitutionalCoverageEntry } from './stage-9j-evidence-collector.js'

export interface ConstitutionalVerificationResult {
  readonly allVerified: boolean
  readonly verified: readonly Stage9JConstitutionalCoverageEntry[]
  readonly failed: readonly Stage9JConstitutionalCoverageEntry[]
  readonly notApplicable: readonly Stage9JConstitutionalCoverageEntry[]
  readonly lawCount: number
}

export function verifyConstitutionalCoverage(
  entries: readonly Stage9JConstitutionalCoverageEntry[],
): ConstitutionalVerificationResult {
  const verified = entries.filter(e => e.status === 'verified')
  const failed = entries.filter(e => e.status === 'failed')
  const notApplicable = entries.filter(e => e.status === 'not-applicable')
  return {
    allVerified: failed.length === 0,
    verified,
    failed,
    notApplicable,
    lawCount: entries.length,
  }
}
