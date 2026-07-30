import { RepositoryWriteConflict } from './types.js'
import type { PackageTrustDecisionRecord } from './types.js'

export function validateTrustRecord(record: PackageTrustDecisionRecord): void {
  if (record.subject.packageId !== record.artifactIdentity.packageId) {
    throw new RepositoryWriteConflict('record-validation-failure',
      'Subject packageId does not match artifactIdentity packageId')
  }
  if (record.subject.version !== record.artifactIdentity.version) {
    throw new RepositoryWriteConflict('record-validation-failure',
      'Subject version does not match artifactIdentity version')
  }
  if (record.decision === 'denied' && record.assessmentReferences.length === 0) {
    throw new RepositoryWriteConflict('record-validation-failure',
      'Denied decision must have at least one assessment reference (blocker)')
  }
  if (!record.policyReference?.policyId) {
    throw new RepositoryWriteConflict('record-validation-failure', 'Missing policyReference.policyId')
  }
  if (!record.canonicalDigest) {
    throw new RepositoryWriteConflict('record-validation-failure', 'Missing canonicalDigest')
  }
}
