import type { RevocationEntry } from '@rohinik-org/package-trust-ir'

export type TimeEvaluationResult = 'not-yet-effective' | 'effective' | 'effective-permanent'

export function evaluateRevocationTime(
  entry: RevocationEntry,
  evaluatedAt: string,
): TimeEvaluationResult {
  const evalDate = new Date(evaluatedAt)
  const revokedAt = new Date(entry.revokedAt)

  if (revokedAt > evalDate) {
    return 'not-yet-effective'
  }

  return 'effective-permanent'
}
