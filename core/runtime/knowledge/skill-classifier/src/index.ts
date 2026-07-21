import { createHash } from 'node:crypto'
import type {
  KnowledgeFragment,
  ProcedureStep,
  KnowledgeEvidence,
} from '@rohinik-org/knowledge'

export interface SkillCandidate {
  readonly candidateId: string
  readonly name: string
  readonly description: string
  readonly capabilityId: string
  readonly steps: ReadonlyArray<ProcedureStep>
  readonly certainty: number
  readonly evidence: ReadonlyArray<KnowledgeEvidence>
  readonly sourceFragments: ReadonlyArray<string>
}

export interface CapabilityDescriptorIR {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly driverRef: string
  readonly tags: ReadonlyArray<string>
}

export class SkillClassifier {
  classify(fragment: KnowledgeFragment): SkillCandidate[] {
    const candidates: SkillCandidate[] = []
    for (const proc of fragment.procedures) {
      if (proc.requiredCapabilities.length === 0 && proc.steps.length === 0) continue
      const candidateId = createHash('sha256')
        .update(proc.id + fragment.fragmentId)
        .digest('hex')
        .slice(0, 16)
      candidates.push({
        candidateId,
        name: proc.label,
        description: `Procedure extracted from ${fragment.source.id}`,
        capabilityId: `procedure:${proc.label.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase()}`,
        steps: proc.steps,
        certainty: proc.certainty,
        evidence: proc.evidence,
        sourceFragments: [fragment.fragmentId],
      })
    }
    return candidates
  }

  promote(candidate: SkillCandidate): CapabilityDescriptorIR {
    return {
      id: candidate.capabilityId,
      name: candidate.name,
      description: candidate.description,
      driverRef: 'knowledge',
      tags: ['procedure', 'extracted'],
    }
  }
}
