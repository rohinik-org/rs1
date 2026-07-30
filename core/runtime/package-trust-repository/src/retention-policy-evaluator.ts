import type {
  PackageTrustDecisionRecord,
  PackageQuarantineRecord,
  RetentionMetadata,
  RetentionClassification,
  RepositoryRecordId,
} from './types.js'

const DEFAULT_CLASSIFICATION: RetentionClassification = 'retain'

export function createRetentionPolicyEvaluator() {
  // Per-record overrides (for legal hold, etc.)
  const overrides = new Map<string, RetentionClassification>()

  function setOverride(recordId: RepositoryRecordId, classification: RetentionClassification): void {
    overrides.set(recordId, classification)
  }

  function evaluate(record: PackageTrustDecisionRecord | PackageQuarantineRecord, evaluatedAt: string): RetentionMetadata {
    const override = overrides.get(record.recordId)
    const classification: RetentionClassification = override ?? DEFAULT_CLASSIFICATION
    return { recordId: record.recordId, classification, evaluatedAt }
  }

  function isDestructionEligible(record: PackageTrustDecisionRecord | PackageQuarantineRecord, evaluatedAt: string): boolean {
    return evaluate(record, evaluatedAt).classification === 'destruction-eligible'
  }

  return { evaluate, setOverride, isDestructionEligible }
}
