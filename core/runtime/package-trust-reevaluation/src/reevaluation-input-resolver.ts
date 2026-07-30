import type { PackageTrustDecisionRecord } from '@rohinik-org/package-trust-repository'
import type {
  PackageTrustReevaluationCandidate,
  ReevaluationInputReferences,
} from './types.js'
import type { TrustRepositoryReader } from './ports/trust-repository-reader.js'

export interface InputResolverResult {
  readonly inputReferences: ReevaluationInputReferences
  readonly priorRecord: PackageTrustDecisionRecord
}

// Must not evaluate trust — only resolves prior records and assessment references (L-9J-1201)
export async function resolveInputs(
  candidate: PackageTrustReevaluationCandidate,
  reader: TrustRepositoryReader,
): Promise<InputResolverResult> {
  const priorRecord = await reader.getTrustDecisionRecord(candidate.trustDecisionRecordId)
  // L-9J-1227: missing mandatory parent fails closed, not synthesized
  if (!priorRecord) {
    throw new Error(`referential-integrity-failure: prior trust record not found: ${candidate.trustDecisionRecordId}`)
  }

  const inputReferences: ReevaluationInputReferences = {
    priorDecisionRecordId: candidate.trustDecisionRecordId,
    assessmentReferences: priorRecord.assessmentReferences,
    evidenceReference: priorRecord.evidenceReference ?? undefined,
    currentPolicyReference: candidate.currentPolicyReference,
  }

  return { inputReferences, priorRecord }
}
