import type { CapabilityGraphNode, WorkflowDescriptor } from '@rohinik-org/compiler'
import type { CorpusQueryEngine } from '@rohinik-org/corpus'
import type { CapabilityGraphQuery } from '@rohinik-org/knowledge-graph'
import type { RecommendationCandidate, RecommendationStrategy } from './recommendation-strategy.js'

export class WorkflowStrategy implements RecommendationStrategy {
  readonly strategyId = 'WorkflowStrategy'
  readonly recommendationTypes = ['WORKFLOW_STEP'] as const

  // ponytail: structural type avoids hard @rohinik-org/workflow dep; caller wires the store
  constructor(private readonly workflowStore: { findBySkill(skillId: string): Promise<readonly WorkflowDescriptor[]> }) {}

  async recommend(
    anchors: readonly CapabilityGraphNode[],
    _graphQuery: CapabilityGraphQuery,
    _corpus: CorpusQueryEngine,
  ): Promise<readonly RecommendationCandidate[]> {
    const candidates: RecommendationCandidate[] = []
    const seen = new Set<string>()
    for (const anchor of anchors) {
      const workflows = await this.workflowStore.findBySkill(anchor.nodeId)
      for (const wf of workflows) {
        for (const step of wf.definition.steps) {
          if (step.skillId === anchor.nodeId) continue
          if (seen.has(step.skillId)) continue
          seen.add(step.skillId)
          candidates.push({
            nodeId: step.skillId,
            recommendationType: 'WORKFLOW_STEP',
            rawScore: wf.statistics.confidence,
            evidenceSteps: [],
            producedBy: [this.strategyId],
          })
        }
      }
    }
    return candidates
  }
}
