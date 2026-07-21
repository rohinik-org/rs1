import type { WorkingContextIR } from '@rohinik-org/working-context'
import type { Goal } from '@rohinik-org/planner-ir'

export class GoalResolver {
  resolve(context: WorkingContextIR): ReadonlyArray<Goal> {
    const goals: Goal[] = []

    // Group 1: intent concepts — priority 0, source:'intent'
    for (let i = 0; i < context.intent.concepts.length; i++) {
      goals.push(Object.freeze({
        goalId: `intent-concept-${i}-${context.intent.concepts[i]}`,
        skillId: context.intent.concepts[i]!,
        priority: 0,
        source: 'intent' as const,
      }))
    }

    // Group 2: intent preferredSkills — priority 1, source:'intent'
    for (let i = 0; i < context.intent.preferredSkills.length; i++) {
      goals.push(Object.freeze({
        goalId: `intent-skill-${i}-${context.intent.preferredSkills[i]}`,
        skillId: context.intent.preferredSkills[i]!,
        priority: 1,
        source: 'intent' as const,
      }))
    }

    // Group 3: knowledge fragments (already ranked by Stage 10A) — priority 2, source:'knowledge'
    for (let fi = 0; fi < context.knowledgeFragments.length; fi++) {
      const fragment = context.knowledgeFragments[fi]!
      for (let ni = 0; ni < fragment.nodes.length; ni++) {
        const label = fragment.nodes[ni]!.label
        goals.push(Object.freeze({
          goalId: `knowledge-${fi}-${ni}-${label}`,
          skillId: label,
          priority: 2,
          source: 'knowledge' as const,
        }))
      }
    }

    return Object.freeze(goals)
  }
}
