import type { ObservationQuery, RuntimeState, AutonomyPolicy } from '@rohinik-org/compiler'
import type { ObservationStrategy } from './strategies/index.js'

export class ObservationPlanner {
  constructor(private readonly strategies: readonly ObservationStrategy[]) {}

  plan(state: RuntimeState, policy: AutonomyPolicy): readonly ObservationQuery[] {
    const all = this.strategies.flatMap(s => [...s.plan(state, policy)])
    // Deduplicate by joined terms string
    const seen = new Set<string>()
    return all.filter(q => {
      const key = q.categories.join(',') + ':' + q.terms.join(',')
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }
}

export type { ObservationStrategy } from './strategies/index.js'
export { SystemStrategy, GoalStrategy, PolicyStrategy, ScheduleStrategy } from './strategies/index.js'
