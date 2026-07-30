import { describe, it, expect } from 'vitest'
import { validateTransition, assertTransition, isTerminalState } from '../reevaluation-state-machine.js'

describe('ReevaluationStateMachine', () => {
  it('allows DISCOVERED → PLANNED', () => {
    expect(validateTransition('DISCOVERED', 'PLANNED')).toBe(true)
  })

  it('allows PLANNED → WAITING_FOR_LOCK', () => {
    expect(validateTransition('PLANNED', 'WAITING_FOR_LOCK')).toBe(true)
  })

  it('allows WAITING_FOR_LOCK → RUNNING', () => {
    expect(validateTransition('WAITING_FOR_LOCK', 'RUNNING')).toBe(true)
  })

  it('allows RUNNING → DECISION_PRODUCED', () => {
    expect(validateTransition('RUNNING', 'DECISION_PRODUCED')).toBe(true)
  })

  it('allows DECISION_PRODUCED → PERSISTING', () => {
    expect(validateTransition('DECISION_PRODUCED', 'PERSISTING')).toBe(true)
  })

  it('allows PERSISTING → QUARANTINE_PENDING', () => {
    expect(validateTransition('PERSISTING', 'QUARANTINE_PENDING')).toBe(true)
  })

  it('allows PERSISTING → COMPLETED', () => {
    expect(validateTransition('PERSISTING', 'COMPLETED')).toBe(true)
  })

  it('allows QUARANTINE_PENDING → COMPLETED', () => {
    expect(validateTransition('QUARANTINE_PENDING', 'COMPLETED')).toBe(true)
  })

  it('allows QUARANTINE_PENDING → COMPLETED_DEGRADED', () => {
    expect(validateTransition('QUARANTINE_PENDING', 'COMPLETED_DEGRADED')).toBe(true)
  })

  it('rejects illegal transition COMPLETED → RUNNING', () => {
    expect(validateTransition('COMPLETED', 'RUNNING')).toBe(false)
  })

  it('rejects illegal transition FAILED → RUNNING', () => {
    expect(validateTransition('FAILED', 'RUNNING')).toBe(false)
  })

  it('throws on assertTransition for illegal transition', () => {
    expect(() => assertTransition('COMPLETED', 'RUNNING')).toThrow('invalid-reevaluation-state-transition')
  })

  it('isTerminalState returns true for COMPLETED', () => {
    expect(isTerminalState('COMPLETED')).toBe(true)
  })

  it('isTerminalState returns true for FAILED', () => {
    expect(isTerminalState('FAILED')).toBe(true)
  })

  it('isTerminalState returns false for RUNNING', () => {
    expect(isTerminalState('RUNNING')).toBe(false)
  })

  it('allows RUNNING → FAILED', () => {
    expect(validateTransition('RUNNING', 'FAILED')).toBe(true)
  })

  it('allows RUNNING → CANCELLED', () => {
    expect(validateTransition('RUNNING', 'CANCELLED')).toBe(true)
  })

  it('allows WAITING_FOR_LOCK → RETRY_REQUIRED', () => {
    expect(validateTransition('WAITING_FOR_LOCK', 'RETRY_REQUIRED')).toBe(true)
  })
})
