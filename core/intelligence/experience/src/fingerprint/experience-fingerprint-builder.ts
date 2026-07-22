import { createHash } from 'node:crypto'
import type { EvaluationRecord } from '@rohinik-org/evaluation-ir'
import type { ExperienceSource, ExperienceFingerprint } from '@rohinik-org/experience-ir'

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

export class ExperienceFingerprintBuilder {
  build(source: ExperienceSource, evaluation: EvaluationRecord): ExperienceFingerprint {
    const evaluationFingerprint = evaluation.provenance.policyFingerprint
    const experienceId = sha256(
      source.intentHash + source.capabilityHash + source.planHash + evaluationFingerprint,
    )
    return Object.freeze({
      experienceId,
      evaluationFingerprint,
      intentHash: source.intentHash,
      capabilityHash: source.capabilityHash,
      planHash: source.planHash,
    })
  }
}
