import { describe, it, expect } from 'vitest'
import { ScenarioExecutor } from '../executor/scenario-executor.js'
import type { CertificationScenario } from '@rohinik-org/compiler'

function makeScenario(id: string): CertificationScenario {
  return { scenarioId: id, name: id, tags: ['PLANNING'], fixture: { graphRevision: 1, workflowDescriptors: [], capabilityDescriptors: [], observations: [], memory: [], corpus: [], providers: [] }, expectations: [] }
}

describe('ScenarioExecutor', () => {
  it('returns actualResult from runner', async () => {
    const exec = new ScenarioExecutor()
    const { actualResult } = await exec.execute(makeScenario('s1'), async () => ({ ok: true }))
    expect(actualResult['ok']).toBe(true)
  })
  it('timingMs is non-negative number', async () => {
    const exec = new ScenarioExecutor()
    const { timingMs } = await exec.execute(makeScenario('s1'), async () => ({}))
    expect(timingMs).toBeGreaterThanOrEqual(0)
  })
  it('memMb is non-negative number', async () => {
    const exec = new ScenarioExecutor()
    const { memMb } = await exec.execute(makeScenario('s1'), async () => ({}))
    expect(memMb).toBeGreaterThanOrEqual(0)
  })
  it('never throws when runner throws', async () => {
    const exec = new ScenarioExecutor()
    const output = await exec.execute(makeScenario('s1'), async () => { throw new Error('boom') })
    expect(output.actualResult['_threw']).toBe(true)
  })
  it('captures error message when runner throws', async () => {
    const exec = new ScenarioExecutor()
    const { actualResult } = await exec.execute(makeScenario('s1'), async () => { throw new Error('kaboom') })
    expect(String(actualResult['_error'])).toContain('kaboom')
  })
  it('passes scenario to runner', async () => {
    const exec = new ScenarioExecutor()
    let received: string | undefined
    await exec.execute(makeScenario('my-id'), async (s) => { received = s.scenarioId; return {} })
    expect(received).toBe('my-id')
  })
})
