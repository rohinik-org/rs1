import type { PlanCandidate } from './plan-generator.js'

export class PlanOptimizer {
  optimize(candidate: PlanCandidate): PlanCandidate {
    const steps = candidate.executionPlan.steps

    // Remove duplicate steps: same skillId + tierId (structural dedup only — no semantic rewrites)
    const seen = new Set<string>()
    const deduped = steps.filter(step => {
      const key = `${step.skillId}::${step.tierId}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    // No change needed — return same reference (ponytail: avoid object churn)
    if (deduped.length === steps.length) return candidate

    return Object.freeze({
      ...candidate,
      executionPlan: Object.freeze({
        ...candidate.executionPlan,
        steps: Object.freeze(deduped),
      }),
    })
  }
}
