import { describe, it, expect } from 'vitest'
import { RUNTIME_MODE_POLICIES, DEFAULT_BUDGET, DEFAULT_SYSTEM_CONFIG, ZERO_COST, REASONING_CAPABILITY } from '../index.js'

describe('kernel barrel', () => {
  it('exports RUNTIME_MODE_POLICIES', () => {
    expect(RUNTIME_MODE_POLICIES['BALANCED']).toBeDefined()
  })
  it('exports DEFAULT_BUDGET', () => {
    expect(DEFAULT_BUDGET.mode).toBe('BALANCED')
  })
  it('exports DEFAULT_SYSTEM_CONFIG', () => {
    expect(DEFAULT_SYSTEM_CONFIG.runtime.defaultMode).toBe('BALANCED')
  })
  it('exports ZERO_COST', () => {
    expect(ZERO_COST.estimated).toEqual({})
  })
  it('exports REASONING_CAPABILITY', () => {
    expect(REASONING_CAPABILITY.REASONING).toBe('reasoning')
  })
})
