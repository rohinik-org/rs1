import type { ReevaluationLifecycleState } from './types.js'

// Valid transitions for reevaluation lifecycle
const VALID_TRANSITIONS: ReadonlyMap<ReevaluationLifecycleState, ReadonlySet<ReevaluationLifecycleState>> = new Map([
  ['DISCOVERED',        new Set<ReevaluationLifecycleState>(['PLANNED', 'CANCELLED', 'FAILED'])],
  ['PLANNED',           new Set<ReevaluationLifecycleState>(['WAITING_FOR_LOCK', 'CANCELLED', 'FAILED'])],
  ['WAITING_FOR_LOCK',  new Set<ReevaluationLifecycleState>(['RUNNING', 'RETRY_REQUIRED', 'CANCELLED', 'FAILED'])],
  ['RUNNING',           new Set<ReevaluationLifecycleState>(['DECISION_PRODUCED', 'RETRY_REQUIRED', 'FAILED', 'CANCELLED'])],
  ['DECISION_PRODUCED', new Set<ReevaluationLifecycleState>(['PERSISTING'])],
  ['PERSISTING',        new Set<ReevaluationLifecycleState>(['QUARANTINE_PENDING', 'COMPLETED', 'COMPLETED_NO_CHANGE', 'COMPLETED_DEGRADED', 'RETRY_REQUIRED', 'FAILED'])],
  ['QUARANTINE_PENDING',new Set<ReevaluationLifecycleState>(['COMPLETED', 'COMPLETED_DEGRADED', 'FAILED'])],
  ['RETRY_REQUIRED',    new Set<ReevaluationLifecycleState>(['WAITING_FOR_LOCK', 'FAILED', 'CANCELLED'])],
  ['COMPLETED',         new Set<ReevaluationLifecycleState>([])],
  ['COMPLETED_NO_CHANGE', new Set<ReevaluationLifecycleState>([])],
  ['COMPLETED_DEGRADED',  new Set<ReevaluationLifecycleState>([])],
  ['FAILED',            new Set<ReevaluationLifecycleState>([])],
  ['CANCELLED',         new Set<ReevaluationLifecycleState>([])],
  ['SUPERSEDED',        new Set<ReevaluationLifecycleState>([])],
])

export function validateTransition(from: ReevaluationLifecycleState, to: ReevaluationLifecycleState): boolean {
  return VALID_TRANSITIONS.get(from)?.has(to) ?? false
}

export function assertTransition(from: ReevaluationLifecycleState, to: ReevaluationLifecycleState): void {
  if (!validateTransition(from, to)) {
    throw new Error(`invalid-reevaluation-state-transition: ${from} → ${to}`)
  }
}

export function isTerminalState(state: ReevaluationLifecycleState): boolean {
  return ['COMPLETED', 'COMPLETED_NO_CHANGE', 'COMPLETED_DEGRADED', 'FAILED', 'CANCELLED', 'SUPERSEDED'].includes(state)
}

export { VALID_TRANSITIONS }
