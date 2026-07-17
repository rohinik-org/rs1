import type { StructuredIntent, WorkflowMatchEvidence } from '@rohinik-org/compiler'
import type { WorkflowRepository } from './workflow-repository.js'

export class WorkflowMatcher {
  constructor(private readonly repo: WorkflowRepository) {}

  async match(intent: StructuredIntent): Promise<readonly WorkflowMatchEvidence[]> {
    const all = await this.repo.findAll()
    const results: WorkflowMatchEvidence[] = []

    for (const descriptor of all) {
      const skillTokens = new Set(
        descriptor.definition.steps.flatMap(s => s.skillId.toLowerCase().replace(/[-_]/g, ' ').split(' '))
      )
      const matched = intent.concepts.filter(c => skillTokens.has(c.toLowerCase()))
      const unmatched = intent.concepts.filter(c => !skillTokens.has(c.toLowerCase()))
      const rawMatchScore = intent.concepts.length > 0 ? matched.length / intent.concepts.length : 0
      if (rawMatchScore === 0) continue

      results.push({
        workflowId: descriptor.workflowId,
        descriptor,
        matchedConcepts: matched,
        unmatchedConcepts: unmatched,
        rawMatchScore,
      })
    }

    return results
  }
}
