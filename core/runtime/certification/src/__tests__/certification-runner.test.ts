import { describe, it, expect } from 'vitest'
import { CertificationRunner } from '../runner/certification-runner.js'
import { NullCertificationStore } from '../store/null-certification-store.js'
import type { CertificationScenario } from '@rohinik-org/compiler'

function makeScenario(id: string, expectations: CertificationScenario['expectations'] = []): CertificationScenario {
  return { scenarioId: id, name: id, tags: ['PLANNING'], fixture: { graphRevision: 1, workflowDescriptors: [], capabilityDescriptors: [], observations: [], memory: [], corpus: [], providers: [] }, expectations }
}

describe('CertificationRunner', () => {
  it('returns CertificationReport', async () => {
    const runner = new CertificationRunner(new NullCertificationStore())
    const report = await runner.run([makeScenario('s1')], {})
    expect(report.reportId).toBeTruthy()
  })

  it('saves report to store', async () => {
    const store = new NullCertificationStore()
    const runner = new CertificationRunner(store)
    const report = await runner.run([makeScenario('s1')], {})
    expect(await store.get(report.reportId)).toBe(report)
  })

  it('result status PASS when no violations', async () => {
    const runner = new CertificationRunner(new NullCertificationStore())
    const report = await runner.run([makeScenario('s1')], { s1: async () => ({ workflowPlanProduced: true }) })
    expect(report.summary.overallStatus).toBe('PASS')
  })

  it('result status FAIL when invariant fails', async () => {
    const runner = new CertificationRunner(new NullCertificationStore())
    const scenario = makeScenario('s1', [{ invariantId: 'PLAN-001', description: 'plan', category: 'PLANNING' }])
    const report = await runner.run([scenario], { s1: async () => ({ workflowPlanProduced: false }) })
    expect(report.summary.overallStatus).toBe('FAIL')
  })

  it('never throws when runner throws', async () => {
    const runner = new CertificationRunner(new NullCertificationStore())
    const report = await runner.run([makeScenario('s1')], { s1: async () => { throw new Error('boom') } })
    expect(report.reportId).toBeTruthy()
  })

  it('summary counts match results', async () => {
    const runner = new CertificationRunner(new NullCertificationStore())
    const report = await runner.run([makeScenario('s1'), makeScenario('s2')], {})
    expect(report.summary.totalScenarios).toBe(2)
  })
})
