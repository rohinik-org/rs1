import type { PackageTrustDecision } from '@rohinik-org/package-trust-ir'
import type { TrustDecisionComparison, TrustDecisionChangeClassification } from './types.js'

// Severity ordering for comparison (L-9J-1219)
const SEVERITY: Record<PackageTrustDecision, number> = {
  'trusted': 0,
  'conditionally-trusted': 1,
  'quarantined': 2,
  'manual-review-required': 2,
  'denied': 3,
}

export function compareDecisions(
  prior: PackageTrustDecision,
  successor: PackageTrustDecision,
): TrustDecisionComparison {
  const priorSeverity = SEVERITY[prior]
  const successorSeverity = SEVERITY[successor]
  const isDowngrade = successorSeverity > priorSeverity
  const isUpgrade = successorSeverity < priorSeverity

  let classification: TrustDecisionChangeClassification
  let requiresQuarantine = false

  if (prior === successor) {
    classification = 'no-semantic-change'
  } else if (successor === 'denied' && prior !== 'denied') {
    classification = 'denied-introduced'
    requiresQuarantine = true
  } else if (prior === 'denied' && successor !== 'denied') {
    classification = 'denied-resolved'
  } else if (successor === 'manual-review-required' && prior !== 'manual-review-required') {
    classification = 'manual-review-introduced'
  } else if (prior === 'manual-review-required' && successor !== 'manual-review-required') {
    classification = 'manual-review-resolved'
  } else if (successor === 'conditionally-trusted' && prior === 'trusted') {
    classification = 'restriction-added'
  } else if (prior === 'conditionally-trusted' && successor === 'trusted') {
    classification = 'restriction-removed'
  } else {
    classification = isDowngrade ? 'trust-downgrade' : 'trust-upgrade'
  }

  return {
    classification,
    priorDecision: prior,
    successorDecision: successor,
    isDowngrade,
    requiresQuarantine,
    description: `${prior} → ${successor} (${classification})`,
  }
}
