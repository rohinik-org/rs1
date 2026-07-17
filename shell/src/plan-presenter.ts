import type { PlanIR } from '@rohinik-org/compiler'

export function formatPlan(plan: PlanIR): string {
  const lines: string[] = ['Plan:']
  for (const step of plan.steps) {
    const deps = step.dependsOn.length > 0 ? ` (after: ${step.dependsOn.join(', ')})` : ''
    lines.push(`  ${step.ordinal + 1}. ${step.description}${deps}`)
  }
  return lines.join('\n')
}
