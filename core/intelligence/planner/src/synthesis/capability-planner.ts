import type { StructuredIntent, CapabilityPlanEvidence, SynthesizedStep } from '@rohinik-org/compiler'
import type { CapabilityGraphQuery } from './capability-graph-query.js'

export class CapabilityPlanner {
  constructor(private readonly graph: CapabilityGraphQuery) {}

  async synthesize(intent: StructuredIntent): Promise<readonly CapabilityPlanEvidence[]> {
    if (intent.preferredSkills.length === 0) return []

    const results: CapabilityPlanEvidence[] = []
    const graphPathsExplored: string[] = []

    for (const startSkill of intent.preferredSkills) {
      const neighbors = await this.graph.reachable(startSkill, 3)
      if (neighbors.length === 0) continue

      const steps: SynthesizedStep[] = []
      const allSkills = [startSkill, ...neighbors]

      for (let i = 0; i < allSkills.length; i++) {
        const skillId = allSkills[i]!
        const nextSkill = allSkills[i + 1]
        const graphPath = nextSkill ? `${skillId} → ${nextSkill}` : skillId
        graphPathsExplored.push(graphPath)
        steps.push({
          skillId,
          graphPath,
          rationale: `Reachable from ${startSkill} via graph traversal`,
        })
      }

      const conceptsMatched = intent.concepts.filter(c =>
        allSkills.some(s => s.toLowerCase().includes(c.toLowerCase()))
      )
      const coverageScore = intent.concepts.length > 0 ? conceptsMatched.length / intent.concepts.length : 0

      results.push({
        graphPaths: graphPathsExplored,
        selectedCapabilities: allSkills,
        missingCapabilities: intent.concepts.filter(c =>
          !allSkills.some(s => s.toLowerCase().includes(c.toLowerCase()))
        ),
        synthesizedSteps: steps,
        coverageScore,
        confidence: 0.7 * coverageScore,
      })
    }

    return results
  }
}
