import type { ObservationQuery, RuntimeState, AutonomyPolicy } from '@rohinik-org/compiler'

export interface ObservationStrategy {
  plan(state: RuntimeState, policy: AutonomyPolicy): readonly ObservationQuery[]
}

export class SystemStrategy implements ObservationStrategy {
  plan(_state: RuntimeState, _policy: AutonomyPolicy): readonly ObservationQuery[] {
    return [
      { categories: ['PROVIDER'], terms: ['health'] },
    ]
  }
}

export class GoalStrategy implements ObservationStrategy {
  constructor(private readonly pendingGoals: ReadonlyArray<import('@rohinik-org/compiler').Goal>) {}

  plan(_state: RuntimeState, _policy: AutonomyPolicy): readonly ObservationQuery[] {
    if (this.pendingGoals.length === 0) return []
    const terms = this.pendingGoals.flatMap(g => g.intent.concepts)
    const unique = [...new Set(terms)]
    return unique.length > 0 ? [{ categories: ['PACKAGE', 'DOCUMENTATION'], terms: unique }] : []
  }
}

export class PolicyStrategy implements ObservationStrategy {
  plan(_state: RuntimeState, policy: AutonomyPolicy): readonly ObservationQuery[] {
    if (!policy.observationTerms || policy.observationTerms.length === 0) return []
    return [{ categories: ['PACKAGE'], terms: [...policy.observationTerms] }]
  }
}

export class ScheduleStrategy implements ObservationStrategy {
  private lastRunMs = 0

  constructor(private readonly intervalMs: number = 3_600_000) {}

  plan(_state: RuntimeState, _policy: AutonomyPolicy): readonly ObservationQuery[] {
    const now = Date.now()
    if (now - this.lastRunMs < this.intervalMs) return []
    this.lastRunMs = now
    return [{ categories: ['PACKAGE'], terms: ['dependencies'] }]
  }
}
