import { describe, it, expect } from 'vitest'
import { DefaultCertifyFacade, NoopCertifyFacade } from '../facades/certify-facade.js'

describe('DefaultCertifyFacade', () => {
  it('run() with empty scenarios returns PASS report', async () => {
    const facade = new DefaultCertifyFacade()
    const report = await facade.run([], {})
    expect(report.reportId).toBeDefined()
    expect(report.summary.totalScenarios).toBe(0)
  })

  it('run() summary overallStatus is PASS for no scenarios', async () => {
    const facade = new DefaultCertifyFacade()
    const report = await facade.run([], {})
    expect(report.summary.overallStatus).toBe('PASS')
  })

  it('latest() returns undefined before any run', async () => {
    const facade = new DefaultCertifyFacade()
    const result = await facade.latest()
    expect(result).toBeUndefined()
  })

  it('latest() returns report after run', async () => {
    const facade = new DefaultCertifyFacade()
    await facade.run([], {})
    const result = await facade.latest()
    expect(result).toBeDefined()
  })
})

describe('NoopCertifyFacade', () => {
  it('run() returns SKIPPED report without throwing', async () => {
    const facade = new NoopCertifyFacade()
    const report = await facade.run([], {})
    expect(report.summary.overallStatus).toBe('SKIPPED')
  })
})
