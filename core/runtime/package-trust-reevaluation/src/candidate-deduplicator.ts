import type {
  PackageTrustReevaluationCandidate,
  PackageTrustReevaluationTrigger,
  ReevaluationSelectionReason,
} from './types.js'

interface DeduplicatedCandidate {
  readonly candidate: PackageTrustReevaluationCandidate
  readonly mergedTriggerIds: readonly string[]
  readonly mergedSelectionReasons: readonly ReevaluationSelectionReason[]
}

// Merge overlapping triggers for the same trust record. Prevents duplicate pipeline runs.
export function deduplicateCandidates(
  candidates: readonly PackageTrustReevaluationCandidate[],
  triggers: readonly PackageTrustReevaluationTrigger[],
): DeduplicatedCandidate[] {
  const seen = new Map<string, DeduplicatedCandidate>()

  for (const candidate of candidates) {
    const key = candidate.trustDecisionRecordId
    const existing = seen.get(key)
    if (!existing) {
      seen.set(key, {
        candidate,
        mergedTriggerIds: [...candidate.matchedTriggerIds],
        mergedSelectionReasons: [...candidate.selectionReasons],
      })
    } else {
      // Merge: union trigger IDs and reasons
      const allTriggerIds = new Set([...existing.mergedTriggerIds, ...candidate.matchedTriggerIds])
      const allReasons = [...existing.mergedSelectionReasons]
      for (const r of candidate.selectionReasons) {
        if (!allReasons.some(er => er.triggerId === r.triggerId && er.reasonType === r.reasonType)) {
          allReasons.push(r)
        }
      }
      seen.set(key, {
        candidate: existing.candidate,
        mergedTriggerIds: [...allTriggerIds],
        mergedSelectionReasons: allReasons,
      })
    }
  }

  return [...seen.values()]
}
