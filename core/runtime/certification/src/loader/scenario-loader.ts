import type { CertificationScenario, CertificationCategory } from '@rohinik-org/compiler'

export interface ScenarioFilter {
  readonly tag?: CertificationCategory
  readonly id?: string
}

export function filterScenarios(scenarios: readonly CertificationScenario[], filter?: ScenarioFilter): CertificationScenario[] {
  let result = [...scenarios]
  if (filter?.tag !== undefined) {
    const tag = filter.tag
    result = result.filter(s => s.tags.includes(tag))
  }
  if (filter?.id !== undefined) {
    const id = filter.id
    result = result.filter(s => s.scenarioId === id)
  }
  return result
}
