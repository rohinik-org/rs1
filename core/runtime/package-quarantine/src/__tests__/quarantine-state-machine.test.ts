import { describe, it, expect } from 'vitest'
import { validateTransition, buildTransitionHistory, VALID_TRANSITIONS } from '../quarantine-state-machine.js'
import type { QuarantineLifecycleState, QuarantineLifecycleTransition } from '../types.js'

describe('QuarantineStateMachine', () => {
  it('validates all documented valid transitions', () => {
    for (const [from, tos] of Object.entries(VALID_TRANSITIONS)) {
      for (const to of tos as QuarantineLifecycleState[]) {
        expect(validateTransition(from as QuarantineLifecycleState, to)).toBe(true)
      }
    }
  })

  it('rejects terminal → any transition', () => {
    const terminals: QuarantineLifecycleState[] = ['CONTAINMENT_FAILED', 'VERIFICATION_FAILED', 'SUPERSEDED']
    for (const terminal of terminals) {
      expect(validateTransition(terminal, 'QUARANTINED')).toBe(false)
      expect(validateTransition(terminal, 'PLANNED')).toBe(false)
    }
  })

  it('rejects skip transitions', () => {
    expect(validateTransition('UNQUARANTINED', 'QUARANTINED')).toBe(false)
    expect(validateTransition('PLANNED', 'QUARANTINED')).toBe(false)
  })

  it('buildTransitionHistory returns ordered states', () => {
    const transitions: QuarantineLifecycleTransition[] = [
      { from: 'UNQUARANTINED', to: 'PLANNED', at: 't1' },
      { from: 'PLANNED', to: 'CONTAINING', at: 't2' },
      { from: 'CONTAINING', to: 'QUARANTINED', at: 't3' },
    ]
    const history = buildTransitionHistory(transitions)
    expect(history).toEqual(['UNQUARANTINED', 'PLANNED', 'CONTAINING', 'QUARANTINED'])
  })

  it('buildTransitionHistory returns empty for no transitions', () => {
    expect(buildTransitionHistory([])).toEqual([])
  })

  it('QUARANTINED can transition to RELEASE_PENDING or SUPERSEDED', () => {
    expect(validateTransition('QUARANTINED', 'RELEASE_PENDING')).toBe(true)
    expect(validateTransition('QUARANTINED', 'SUPERSEDED')).toBe(true)
    expect(validateTransition('QUARANTINED', 'PLANNED')).toBe(false)
  })
})
