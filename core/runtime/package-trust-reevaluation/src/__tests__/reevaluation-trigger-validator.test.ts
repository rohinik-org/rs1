import { describe, it, expect } from 'vitest'
import { validateTrigger } from '../reevaluation-trigger-validator.js'
import type { PackageTrustReevaluationTrigger } from '../types.js'

function baseTrigger(overrides: Partial<PackageTrustReevaluationTrigger> = {}): PackageTrustReevaluationTrigger {
  return {
    triggerId: 'trig-001',
    triggerType: 'policy-changed',
    authority: 'system-policy',
    scope: {},
    reason: 'policy updated',
    changedReferences: [],
    occurredAt: '2026-07-30T10:00:00Z',
    requestedAt: '2026-07-30T10:00:01Z',
    operationId: 'op-001',
    policyReference: { policyId: 'pol-1', policyVersion: '1.0', semanticHash: 'abc' },
    ...overrides,
  }
}

describe('ReevaluationTriggerValidator', () => {
  it('accepts a valid trigger', () => {
    expect(validateTrigger(baseTrigger())).toEqual({ valid: true })
  })

  it('rejects empty triggerId', () => {
    const r = validateTrigger(baseTrigger({ triggerId: '' }))
    expect(r.valid).toBe(false)
    expect((r as { valid: false; reason: string }).reason).toContain('triggerId')
  })

  it('rejects missing reason', () => {
    const r = validateTrigger(baseTrigger({ reason: '' }))
    expect(r.valid).toBe(false)
  })

  it('rejects missing operationId', () => {
    const r = validateTrigger(baseTrigger({ operationId: '' }))
    expect(r.valid).toBe(false)
  })

  it('rejects invalid occurredAt timestamp', () => {
    const r = validateTrigger(baseTrigger({ occurredAt: 'not-a-date' }))
    expect(r.valid).toBe(false)
    expect((r as { valid: false; reason: string }).reason).toContain('occurredAt')
  })

  it('rejects invalid requestedAt timestamp', () => {
    const r = validateTrigger(baseTrigger({ requestedAt: 'bad' }))
    expect(r.valid).toBe(false)
    expect((r as { valid: false; reason: string }).reason).toContain('requestedAt')
  })

  it('rejects global scope without approved authority', () => {
    const r = validateTrigger(baseTrigger({ scope: { global: true }, authority: 'runtime-operator' }))
    expect(r.valid).toBe(false)
    expect((r as { valid: false; reason: string }).reason).toContain('global scope')
  })

  it('accepts global scope with emergency-authority', () => {
    const r = validateTrigger(baseTrigger({ scope: { global: true }, authority: 'emergency-authority' }))
    expect(r.valid).toBe(true)
  })

  it('accepts global scope with system-policy', () => {
    const r = validateTrigger(baseTrigger({ scope: { global: true }, authority: 'system-policy' }))
    expect(r.valid).toBe(true)
  })

  it('rejects missing policyReference.policyId', () => {
    const r = validateTrigger(baseTrigger({ policyReference: { policyId: '', policyVersion: '1.0', semanticHash: 'x' } }))
    expect(r.valid).toBe(false)
  })

  it('accepts emergency-recall trigger type', () => {
    const r = validateTrigger(baseTrigger({ triggerType: 'emergency-recall', authority: 'emergency-authority' }))
    expect(r.valid).toBe(true)
  })
})
