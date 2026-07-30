import type { AuthorizationLifecycleState } from './types.js'
import { AuthorizationError } from './types.js'

const ALLOWED_TRANSITIONS: ReadonlyMap<AuthorizationLifecycleState, readonly AuthorizationLifecycleState[]> = new Map([
  ['REQUESTED',                  ['EVALUATING']],
  ['EVALUATING',                 ['AUTHORIZED', 'AUTHORIZED_WITH_CONDITIONS', 'DEFERRED', 'MANUAL_REVIEW_REQUIRED', 'DENIED', 'FAILED']],
  ['AUTHORIZED',                 ['CONSUMED', 'EXPIRED', 'INVALIDATED', 'SUPERSEDED']],
  ['AUTHORIZED_WITH_CONDITIONS', ['CONSUMED', 'EXPIRED', 'INVALIDATED', 'SUPERSEDED']],
  ['DEFERRED',                   []],
  ['MANUAL_REVIEW_REQUIRED',     []],
  ['DENIED',                     []],
  ['CONSUMED',                   []],
  ['EXPIRED',                    []],
  ['INVALIDATED',                []],
  ['SUPERSEDED',                 []],
  ['FAILED',                     []],
])

export function assertValidTransition(from: AuthorizationLifecycleState, to: AuthorizationLifecycleState): void {
  const allowed = ALLOWED_TRANSITIONS.get(from) ?? []
  if (!allowed.includes(to)) {
    throw new AuthorizationError('invalid-transition', `Cannot transition from ${from} to ${to}`)
  }
}

export function isTerminalState(state: AuthorizationLifecycleState): boolean {
  return (ALLOWED_TRANSITIONS.get(state) ?? []).length === 0
}

export function isUsableState(state: AuthorizationLifecycleState): boolean {
  return state === 'AUTHORIZED' || state === 'AUTHORIZED_WITH_CONDITIONS'
}
