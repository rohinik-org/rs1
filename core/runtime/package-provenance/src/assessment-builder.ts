import type { PackageTrustSubject } from '@rohinik-org/package-trust-ir'
import type {
  ProvenanceAssessmentResult,
  ProvenanceOutcome,
  PolicyViolation,
} from './types.js'

export class AssessmentBuilder {
  verified(
    subject: PackageTrustSubject,
    evaluatedAt: string,
    builderIdentity: string,
    sourceRevision: string,
    artifactDigest: import('@rohinik-org/package-trust-ir').IntegrityDigest,
    statementId: string,
    statementType: string,
    statementVersion: string,
    materialEvidenceIds: readonly string[],
    outputEvidenceIds: readonly string[],
  ): ProvenanceAssessmentResult {
    return Object.freeze({
      passed: true,
      outcome: 'verified' as ProvenanceOutcome,
      subject,
      evaluatedAt,
      builderIdentity,
      sourceRevision,
      artifactDigest,
      statementId,
      statementType,
      statementVersion,
      materialEvidenceIds,
      outputEvidenceIds,
    })
  }

  degraded(
    subject: PackageTrustSubject,
    evaluatedAt: string,
    degradationReasons: readonly string[],
    opts?: {
      builderIdentity?: string
      sourceRevision?: string
      artifactDigest?: import('@rohinik-org/package-trust-ir').IntegrityDigest
      statementId?: string
      statementType?: string
      statementVersion?: string
      materialEvidenceIds?: readonly string[]
      outputEvidenceIds?: readonly string[]
    },
  ): ProvenanceAssessmentResult {
    return Object.freeze({
      passed: true,
      outcome: 'verified-degraded' as ProvenanceOutcome,
      subject,
      evaluatedAt,
      degradationReasons,
      ...(opts?.builderIdentity !== undefined ? { builderIdentity: opts.builderIdentity } : {}),
      ...(opts?.sourceRevision !== undefined ? { sourceRevision: opts.sourceRevision } : {}),
      ...(opts?.artifactDigest !== undefined ? { artifactDigest: opts.artifactDigest } : {}),
      ...(opts?.statementId !== undefined ? { statementId: opts.statementId } : {}),
      ...(opts?.statementType !== undefined ? { statementType: opts.statementType } : {}),
      ...(opts?.statementVersion !== undefined ? { statementVersion: opts.statementVersion } : {}),
      ...(opts?.materialEvidenceIds !== undefined ? { materialEvidenceIds: opts.materialEvidenceIds } : {}),
      ...(opts?.outputEvidenceIds !== undefined ? { outputEvidenceIds: opts.outputEvidenceIds } : {}),
    })
  }

  failed(
    outcome: Exclude<ProvenanceOutcome, 'verified' | 'verified-degraded'>,
    subject: PackageTrustSubject,
    evaluatedAt: string,
    opts?: {
      reason?: string
      policyViolations?: readonly PolicyViolation[]
      statementId?: string
      statementType?: string
      statementVersion?: string
    },
  ): ProvenanceAssessmentResult {
    return Object.freeze({
      passed: false,
      outcome,
      subject,
      evaluatedAt,
      ...(opts?.reason !== undefined ? { reason: opts.reason } : {}),
      ...(opts?.policyViolations !== undefined ? { policyViolations: opts.policyViolations } : {}),
      ...(opts?.statementId !== undefined ? { statementId: opts.statementId } : {}),
      ...(opts?.statementType !== undefined ? { statementType: opts.statementType } : {}),
      ...(opts?.statementVersion !== undefined ? { statementVersion: opts.statementVersion } : {}),
    })
  }
}
