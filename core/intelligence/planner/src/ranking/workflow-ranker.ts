import { randomUUID } from 'node:crypto'
import type { WorkflowMatchEvidence, CapabilityPlanEvidence, WorkflowPlanCandidate } from '@rohinik-org/compiler'
import type { PlanningPolicy } from './planning-policy.js'

const DISCOVERED_PROVENANCE_WEIGHT = 1.00
const SYNTHESIZED_PROVENANCE_WEIGHT = 0.85
const TIE_EPSILON = 0.001

export class WorkflowRanker {
  constructor(private readonly policy: PlanningPolicy) {}

  rank(
    matchEvidence: readonly WorkflowMatchEvidence[],
    synthesisEvidence: readonly CapabilityPlanEvidence[],
  ): readonly WorkflowPlanCandidate[] {
    const candidates: WorkflowPlanCandidate[] = []

    for (const m of matchEvidence) {
      const planningConfidence = m.rawMatchScore
      const evidenceConfidence = m.descriptor.statistics.confidence
      const provenanceWeight = DISCOVERED_PROVENANCE_WEIGHT
      candidates.push({
        candidateId: randomUUID(),
        origin: 'DISCOVERED',
        workflowReference: { kind: 'DISCOVERED', workflowId: m.workflowId, descriptor: m.descriptor },
        scores: {
          planningConfidence,
          evidenceConfidence,
          provenanceWeight,
          finalScore: planningConfidence * evidenceConfidence * provenanceWeight,
        },
      })
    }

    for (const s of synthesisEvidence) {
      const planningConfidence = s.coverageScore
      const evidenceConfidence = s.confidence
      const provenanceWeight = SYNTHESIZED_PROVENANCE_WEIGHT
      const workflowId = `synthesized-${randomUUID()}`
      candidates.push({
        candidateId: randomUUID(),
        origin: 'SYNTHESIZED',
        workflowReference: { kind: 'SYNTHESIZED', workflowId, synthesisEvidence: s },
        scores: {
          planningConfidence,
          evidenceConfidence,
          provenanceWeight,
          finalScore: planningConfidence * evidenceConfidence * provenanceWeight,
        },
      })
    }

    return candidates.sort((a, b) => {
      const diff = b.scores.finalScore - a.scores.finalScore
      if (Math.abs(diff) < TIE_EPSILON) {
        if (a.origin === 'DISCOVERED' && b.origin === 'SYNTHESIZED') return -1
        if (a.origin === 'SYNTHESIZED' && b.origin === 'DISCOVERED') return 1
      }
      return diff
    })
  }
}
