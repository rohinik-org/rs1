import { describe, it, expect } from 'vitest'
import { ConstitutionalInvariantRegistry } from '../analyzer/constitutional-invariant.js'

describe('ConstitutionalInvariantRegistry', () => {
  it('loads 12 built-in invariants by default', () => {
    const reg = new ConstitutionalInvariantRegistry()
    expect(reg.list().length).toBe(12)
  })
  it('contains all namespaced IDs', () => {
    const reg = new ConstitutionalInvariantRegistry()
    const ids = reg.list().map(i => i.invariantId)
    expect(ids).toContain('PLAN-001')
    expect(ids).toContain('EXEC-001')
    expect(ids).toContain('MEM-001')
    expect(ids).toContain('DIST-001')
    expect(ids).toContain('AGENT-001')
  })
  it('register adds custom invariant', () => {
    const reg = new ConstitutionalInvariantRegistry()
    reg.register({ invariantId: 'CUSTOM-001', title: 'Custom', description: 'test', verify: r => ({ invariantId: 'CUSTOM-001', passed: !!r['ok'] }) })
    expect(reg.get('CUSTOM-001')?.title).toBe('Custom')
    expect(reg.list().length).toBe(13)
  })
  it('PLAN-001 passes when workflowPlanProduced=true', () => {
    const reg = new ConstitutionalInvariantRegistry()
    const result = reg.get('PLAN-001')!.verify({ workflowPlanProduced: true })
    expect(result.passed).toBe(true)
  })
  it('PLAN-001 fails when workflowPlanProduced=false', () => {
    const reg = new ConstitutionalInvariantRegistry()
    const result = reg.get('PLAN-001')!.verify({ workflowPlanProduced: false })
    expect(result.passed).toBe(false)
    expect(result.message).toBeDefined()
  })
  it('loadBuiltIns=false produces empty registry', () => {
    const reg = new ConstitutionalInvariantRegistry(false)
    expect(reg.list().length).toBe(0)
  })
})
