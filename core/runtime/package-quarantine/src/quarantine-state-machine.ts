import type { QuarantineLifecycleState, QuarantineLifecycleTransition } from './types.js'

export const VALID_TRANSITIONS: Record<QuarantineLifecycleState, readonly QuarantineLifecycleState[]> = {
  UNQUARANTINED: ['PLANNED'],
  PLANNED: ['CONTAINING'],
  CONTAINING: ['QUARANTINED', 'QUARANTINED_DEGRADED', 'CONTAINMENT_FAILED', 'VERIFICATION_FAILED', 'MANUAL_INTERVENTION_REQUIRED'],
  QUARANTINED: ['RELEASE_PENDING', 'SUPERSEDED'],
  QUARANTINED_DEGRADED: ['MANUAL_INTERVENTION_REQUIRED', 'SUPERSEDED'],
  RELEASE_PENDING: ['QUARANTINED', 'MANUAL_INTERVENTION_REQUIRED'],
  MANUAL_INTERVENTION_REQUIRED: ['QUARANTINED', 'SUPERSEDED'],
  CONTAINMENT_FAILED: [],
  VERIFICATION_FAILED: [],
  SUPERSEDED: [],
}

export function validateTransition(from: QuarantineLifecycleState, to: QuarantineLifecycleState): boolean {
  return (VALID_TRANSITIONS[from] as readonly string[]).includes(to)
}

export function buildTransitionHistory(transitions: readonly QuarantineLifecycleTransition[]): readonly QuarantineLifecycleState[] {
  return transitions.map(t => t.from).concat(
    transitions.length > 0 ? [transitions[transitions.length - 1]!.to] : [],
  )
}
