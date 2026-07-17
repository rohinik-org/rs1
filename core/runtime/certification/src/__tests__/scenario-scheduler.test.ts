import { describe, it, expect } from 'vitest'
import { scheduleBatches } from '../scheduler/scenario-scheduler.js'
import type { CertificationScenario } from '@rohinik-org/compiler'

function makeScenario(id: string, tags: CertificationScenario['tags']): CertificationScenario {
  return { scenarioId: id, name: id, tags, fixture: { graphRevision: 1, workflowDescriptors: [], capabilityDescriptors: [], observations: [], memory: [], corpus: [], providers: [] }, expectations: [] }
}

describe('scheduleBatches', () => {
  it('non-FULL_PIPELINE scenarios batched together', () => {
    const batches = scheduleBatches([makeScenario('s1', ['PLANNING']), makeScenario('s2', ['EXECUTION'])])
    expect(batches.length).toBe(1)
    expect(batches[0]!.length).toBe(2)
  })
  it('FULL_PIPELINE scenario gets its own batch', () => {
    const batches = scheduleBatches([makeScenario('fp', ['FULL_PIPELINE'])])
    expect(batches.length).toBe(1)
    expect(batches[0]!.length).toBe(1)
  })
  it('FULL_PIPELINE splits preceding batch', () => {
    const batches = scheduleBatches([makeScenario('s1', ['PLANNING']), makeScenario('fp', ['FULL_PIPELINE']), makeScenario('s2', ['EXECUTION'])])
    expect(batches.length).toBe(3)
  })
  it('empty scenarios returns no batches', () => {
    expect(scheduleBatches([]).length).toBe(0)
  })
  it('multiple FULL_PIPELINE each own batch', () => {
    const batches = scheduleBatches([makeScenario('fp1', ['FULL_PIPELINE']), makeScenario('fp2', ['FULL_PIPELINE'])])
    expect(batches.length).toBe(2)
    expect(batches[0]![0]!.scenarioId).toBe('fp1')
    expect(batches[1]![0]!.scenarioId).toBe('fp2')
  })
})
