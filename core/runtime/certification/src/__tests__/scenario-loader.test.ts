import { describe, it, expect } from 'vitest'
import { filterScenarios } from '../loader/scenario-loader.js'
import type { CertificationScenario } from '@rohinik-org/compiler'

function makeScenario(id: string, tags: CertificationScenario['tags']): CertificationScenario {
  return { scenarioId: id, name: id, tags, fixture: { graphRevision: 1, workflowDescriptors: [], capabilityDescriptors: [], observations: [], memory: [], corpus: [], providers: [] }, expectations: [] }
}

describe('filterScenarios', () => {
  it('no filter returns all', () => {
    const scenarios = [makeScenario('s1', ['PLANNING']), makeScenario('s2', ['EXECUTION'])]
    expect(filterScenarios(scenarios).length).toBe(2)
  })
  it('tag filter returns matching', () => {
    const scenarios = [makeScenario('s1', ['PLANNING']), makeScenario('s2', ['EXECUTION']), makeScenario('s3', ['PLANNING'])]
    expect(filterScenarios(scenarios, { tag: 'PLANNING' }).length).toBe(2)
  })
  it('id filter returns one', () => {
    const scenarios = [makeScenario('s1', ['PLANNING']), makeScenario('s2', ['EXECUTION'])]
    const result = filterScenarios(scenarios, { id: 's2' })
    expect(result.length).toBe(1)
    expect(result[0]!.scenarioId).toBe('s2')
  })
  it('non-matching filter returns empty', () => {
    const scenarios = [makeScenario('s1', ['PLANNING'])]
    expect(filterScenarios(scenarios, { tag: 'DISTRIBUTED' }).length).toBe(0)
  })
  it('preserves scenario order', () => {
    const scenarios = [makeScenario('s2', ['PLANNING']), makeScenario('s1', ['PLANNING'])]
    const result = filterScenarios(scenarios, { tag: 'PLANNING' })
    expect(result[0]!.scenarioId).toBe('s2')
    expect(result[1]!.scenarioId).toBe('s1')
  })
})
