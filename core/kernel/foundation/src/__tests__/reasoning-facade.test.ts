import { describe, it, expect } from 'vitest'
import { DefaultReasoningFacade, NoopReasoningFacade } from '../facades/reasoning-facade.js'

const fakeInput = {
  observations: [],
  executionResults: [],
  externalSignals: [],
}

describe('DefaultReasoningFacade', () => {
  it('reason() returns a ReasoningReport', async () => {
    const facade = new DefaultReasoningFacade()
    const report = await facade.reason(fakeInput)
    expect(report.kind).toBe('ReasoningReport')
  })

  it('reason() produces a reportId', async () => {
    const facade = new DefaultReasoningFacade()
    const report = await facade.reason(fakeInput)
    expect(typeof report.reportId).toBe('string')
  })

  it('reason() handles empty inputs without throwing', async () => {
    const facade = new DefaultReasoningFacade()
    await expect(facade.reason(fakeInput)).resolves.toBeDefined()
  })

  it('report has status field', async () => {
    const facade = new DefaultReasoningFacade()
    const report = await facade.reason(fakeInput)
    expect(['APPROVED', 'DEFERRED', 'REJECTED']).toContain(report.status)
  })

  it('report has hypothesisSet array', async () => {
    const facade = new DefaultReasoningFacade()
    const report = await facade.reason(fakeInput)
    expect(Array.isArray(report.hypothesisSet)).toBe(true)
  })
})

describe('NoopReasoningFacade', () => {
  it('returns rejected report without throwing', async () => {
    const facade = new NoopReasoningFacade()
    const report = await facade.reason(fakeInput)
    expect(report.status).toBe('REJECTED')
  })
})
