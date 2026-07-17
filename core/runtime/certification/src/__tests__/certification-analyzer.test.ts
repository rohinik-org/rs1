import { describe, it, expect } from 'vitest'
import { CertificationAnalyzer } from '../analyzer/certification-analyzer.js'
import { ConstitutionalInvariantRegistry } from '../analyzer/constitutional-invariant.js'
import type { CertificationExpectation } from '@rohinik-org/compiler'

function makeExpectation(invariantId: string): CertificationExpectation {
  return { invariantId, description: invariantId, category: 'PLANNING' }
}

describe('CertificationAnalyzer', () => {
  it('returns no violations when known invariant passes', () => {
    const analyzer = new CertificationAnalyzer()
    const violations = analyzer.analyze('s1', [makeExpectation('PLAN-001')], { workflowPlanProduced: true })
    expect(violations.length).toBe(0)
  })

  it('returns ERROR violation when known invariant fails', () => {
    const analyzer = new CertificationAnalyzer()
    const violations = analyzer.analyze('s1', [makeExpectation('PLAN-001')], { workflowPlanProduced: false })
    expect(violations.length).toBe(1)
    expect(violations[0]!.severity).toBe('ERROR')
  })

  it('returns WARNING violation for unknown invariant ID', () => {
    const analyzer = new CertificationAnalyzer()
    const violations = analyzer.analyze('s1', [makeExpectation('UNKNOWN-999')], {})
    expect(violations.length).toBe(1)
    expect(violations[0]!.severity).toBe('WARNING')
  })

  it('violation contains correct scenarioId', () => {
    const analyzer = new CertificationAnalyzer()
    const violations = analyzer.analyze('my-scenario', [makeExpectation('PLAN-001')], {})
    expect(violations[0]!.scenarioId).toBe('my-scenario')
  })

  it('violation contains correct invariantId', () => {
    const analyzer = new CertificationAnalyzer()
    const violations = analyzer.analyze('s1', [makeExpectation('EXEC-001')], {})
    expect(violations[0]!.invariantId).toBe('EXEC-001')
  })

  it('multiple expectations produce one violation each when all fail', () => {
    const analyzer = new CertificationAnalyzer()
    const violations = analyzer.analyze('s1', [
      makeExpectation('PLAN-001'),
      makeExpectation('EXEC-001'),
    ], {})
    expect(violations.length).toBe(2)
  })

  it('empty expectations returns no violations', () => {
    const analyzer = new CertificationAnalyzer()
    expect(analyzer.analyze('s1', [], {}).length).toBe(0)
  })

  it('accepts custom registry with custom invariant', () => {
    const registry = new ConstitutionalInvariantRegistry(false)
    registry.register({
      invariantId: 'CUSTOM-001',
      title: 'Custom',
      description: 'Custom invariant',
      verify: (r) => ({ invariantId: 'CUSTOM-001', passed: r['ok'] === true }),
    })
    const analyzer = new CertificationAnalyzer(registry)
    const violations = analyzer.analyze('s1', [makeExpectation('CUSTOM-001')], { ok: true })
    expect(violations.length).toBe(0)
  })
})
