import type { WorkflowPlan } from '@rohinik-org/compiler'

export class PlanExplainer {
  explain(plan: WorkflowPlan): string {
    const lines: string[] = []
    lines.push(`Plan: ${plan.intent.rawInput}`)
    lines.push(`Origin: ${plan.selectedCandidate.origin}`)
    lines.push(`Score: ${plan.selectedCandidate.scores.finalScore.toFixed(2)}`)
    lines.push(`Status: ${plan.simulation.status}`)
    lines.push(`Steps (${plan.steps.length}):`)
    for (const step of plan.steps) {
      lines.push(`  ${step.position + 1}. ${step.skillId}`)
    }
    if (plan.alternatives.length > 0) {
      lines.push(`Alternatives: ${plan.alternatives.length}`)
      for (const alt of plan.alternatives) {
        lines.push(`  - ${alt.workflowReference.workflowId} (score: ${alt.scores.finalScore.toFixed(2)}, origin: ${alt.origin})`)
      }
    }
    if (plan.simulation.errors.length > 0) {
      lines.push(`Errors: ${plan.simulation.errors.join(', ')}`)
    }
    if (plan.simulation.warnings.length > 0) {
      lines.push(`Warnings: ${plan.simulation.warnings.join(', ')}`)
    }
    return lines.join('\n')
  }
}
