import type {
  PackageTrustReevaluationCandidate,
  PackageTrustReevaluationTrigger,
  ReevaluationSelectionReason,
  ReevaluationReasonType,
} from './types.js'

// Priority ordering for selection: emergency-recall > revocation > critical-vulnerability > publisher-downgrade > policy-change > scheduled-refresh
const TRIGGER_PRIORITY: Record<string, number> = {
  'emergency-recall': 100,
  'revocation-state-changed': 90,
  'vulnerability-advisory-changed': 80,
  'publisher-trust-changed': 70,
  'policy-changed': 60,
  'signature-policy-changed': 55,
  'provenance-policy-changed': 55,
  'permission-policy-changed': 55,
  'artifact-metadata-changed': 50,
  'quarantine-state-changed': 45,
  'repository-integrity-changed': 40,
  'package-version-superseded': 35,
  'manual-request': 30,
  'scheduled-policy-refresh': 20,
}

function triggerTypeToReasonType(triggerType: string): ReevaluationReasonType {
  const map: Record<string, ReevaluationReasonType> = {
    'policy-changed': 'policy-changed',
    'vulnerability-advisory-changed': 'advisory-matched',
    'revocation-state-changed': 'revocation-matched',
    'publisher-trust-changed': 'publisher-downgrade',
    'signature-policy-changed': 'signature-policy-changed',
    'provenance-policy-changed': 'provenance-policy-changed',
    'permission-policy-changed': 'permission-policy-changed',
    'artifact-metadata-changed': 'artifact-metadata-changed',
    'package-version-superseded': 'version-superseded',
    'quarantine-state-changed': 'quarantine-state-changed',
    'repository-integrity-changed': 'repository-integrity-changed',
    'manual-request': 'manual-request',
    'scheduled-policy-refresh': 'scheduled-refresh',
    'emergency-recall': 'emergency-recall',
  }
  return map[triggerType] ?? 'manual-request'
}

export function selectCandidates(
  candidates: readonly PackageTrustReevaluationCandidate[],
  triggers: readonly PackageTrustReevaluationTrigger[],
  asOf: string,
): PackageTrustReevaluationCandidate[] {
  const enriched = candidates
    .filter(c => {
      // Exclude future-effective records (Fix 3: real exclusion using effectiveAt)
      if (c.effectiveAt && c.effectiveAt > asOf) return false
      return true
    })
    .map(c => {
      const matchedTriggerIds = triggers.map(t => t.triggerId)
      const selectionReasons: ReevaluationSelectionReason[] = triggers.map(t => ({
        reasonType: triggerTypeToReasonType(t.triggerType),
        triggerId: t.triggerId,
        description: t.reason,
      }))
      // Compute highest priority from matched triggers
      const maxPriority = triggers.reduce(
        (max, t) => Math.max(max, TRIGGER_PRIORITY[t.triggerType] ?? 0),
        0,
      )
      return { candidate: c, matchedTriggerIds, selectionReasons, priority: maxPriority }
    })

  // Sort: priority DESC → effectiveAt ASC → repositoryRevision ASC → trustDecisionRecordId ASC
  enriched.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority
    const aEff = a.candidate.effectiveAt ?? ''
    const bEff = b.candidate.effectiveAt ?? ''
    if (aEff !== bEff) return aEff < bEff ? -1 : 1
    const aRev = a.candidate.repositoryRevision
    const bRev = b.candidate.repositoryRevision
    if (aRev !== bRev) return aRev - bRev
    return a.candidate.trustDecisionRecordId < b.candidate.trustDecisionRecordId ? -1 : 1
  })

  return enriched.map(e => ({
    ...e.candidate,
    matchedTriggerIds: e.matchedTriggerIds,
    selectionReasons: e.selectionReasons,
  }))
}
