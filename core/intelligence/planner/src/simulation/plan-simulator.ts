import type { WorkflowPlan, CoverageResult, SimulationResult, PlanCost } from '@rohinik-org/compiler'
import type { CapabilityResolver } from './capability-resolver.js'

export class PlanSimulator {
  constructor(
    private readonly resolver: CapabilityResolver,
    private readonly plannerVersion: string,
  ) {}

  simulate(plan: WorkflowPlan): WorkflowPlan {
    const warnings: string[] = []
    const errors: string[] = []
    const matched: string[] = []
    const missing: string[] = []

    const seen = new Set<string>()
    let hasCycle = false
    for (const step of plan.steps) {
      if (seen.has(step.skillId)) {
        hasCycle = true
        errors.push(`Cyclic step detected: ${step.skillId} appears more than once`)
      }
      seen.add(step.skillId)
    }

    if (!hasCycle) {
      for (const step of plan.steps) {
        if (this.resolver.resolveSkill(step.skillId)) {
          matched.push(step.skillId)
        } else {
          missing.push(step.skillId)
          errors.push(`Skill not found in registry: ${step.skillId}`)
        }
      }
    }

    const coverageScore = plan.steps.length > 0 ? matched.length / plan.steps.length : 0
    const coverage: CoverageResult = {
      matchedCapabilities: matched,
      missingCapabilities: missing,
      optionalCapabilities: [],
      coverageScore,
    }

    const status = hasCycle || errors.length > 0
      ? (missing.length === plan.steps.length || hasCycle ? 'INVALID' : 'PARTIALLY_EXECUTABLE')
      : 'EXECUTABLE'

    const cost: PlanCost = {
      estimatedLatencyMs: plan.steps.reduce((sum, s) => {
        const descriptor = plan.selectedCandidate.workflowReference.descriptor
        const step = descriptor?.definition.steps.find(ds => ds.skillId === s.skillId)
        return sum + (step?.statistics.averageLatencyMs ?? 0)
      }, 0),
      estimatedTokens: 0,
      estimatedCostUsd: 0,
      estimatedMemoryMb: 0,
    }

    const simulation: SimulationResult = {
      status,
      warnings,
      errors,
      cost,
      estimatedSteps: plan.steps.length,
      hasCycle,
      coverage,
      simulatedWith: {
        capabilityRegistryRevision: this.resolver.registryRevision,
        plannerVersion: this.plannerVersion,
      },
    }

    return {
      ...plan,
      status: status === 'EXECUTABLE' ? 'EXECUTABLE' : 'DRAFT',
      simulation,
    }
  }
}
