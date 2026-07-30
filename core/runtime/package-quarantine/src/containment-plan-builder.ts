import type {
  QuarantineContainmentPlan,
  QuarantineMode,
  QuarantinePlanStep,
  QuarantinePlanStepKind,
  QuarantineRollbackStrategy,
  PackageTrustSubject,
} from './types.js'

function steps(kinds: QuarantinePlanStepKind[]): QuarantinePlanStep[] {
  return kinds.map(step => ({ step, required: step !== 'release-lock' }))
}

const STEPS_BY_MODE: Record<QuarantineMode, QuarantinePlanStepKind[]> = {
  isolate: ['acquire-lock', 'validate-source', 'seal-source', 'create-namespace', 'move-artifact', 'verify-destination', 'record-result', 'release-lock'],
  'copy-and-seal': ['acquire-lock', 'validate-source', 'seal-source', 'create-namespace', 'copy-artifact', 'verify-destination', 'remove-activation-reference', 'record-result', 'release-lock'],
  seal: ['acquire-lock', 'validate-source', 'seal-source', 'verify-destination', 'record-result', 'release-lock'],
  'deny-activation': ['acquire-lock', 'validate-source', 'remove-activation-reference', 'verify-destination', 'record-result', 'release-lock'],
  'manual-containment': ['acquire-lock', 'validate-source', 'record-result', 'release-lock'],
}

const VERIFICATIONS_BY_MODE: Record<QuarantineMode, string[]> = {
  isolate: ['destination-exists', 'destination-not-activatable', 'identity-continuity'],
  'copy-and-seal': ['destination-exists', 'destination-not-activatable', 'identity-continuity', 'source-deactivated'],
  seal: ['source-sealed', 'destination-not-activatable'],
  'deny-activation': ['source-not-activatable'],
  'manual-containment': [],
}

export function buildContainmentPlan(params: {
  operationId: string
  subject: PackageTrustSubject
  trustDecisionId: string
  mode: QuarantineMode
  sourceLocation: string
  destinationLocation?: string
  plannedAt: string
}): QuarantineContainmentPlan {
  const rollbackStrategy: QuarantineRollbackStrategy =
    params.mode === 'manual-containment' ? 'manual-intervention' : 'preserve-source'

  const base = {
    operationId: params.operationId,
    subject: params.subject,
    trustDecisionId: params.trustDecisionId,
    mode: params.mode,
    sourceLocation: params.sourceLocation,
    steps: steps(STEPS_BY_MODE[params.mode]),
    requiredVerifications: VERIFICATIONS_BY_MODE[params.mode],
    rollbackStrategy,
    plannedAt: params.plannedAt,
  }
  if (params.destinationLocation !== undefined) {
    return { ...base, destinationLocation: params.destinationLocation }
  }
  return base
}
