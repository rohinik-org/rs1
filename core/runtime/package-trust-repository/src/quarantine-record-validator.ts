import { RepositoryWriteConflict } from './types.js'
import type { PackageQuarantineRecord } from './types.js'

export function validateQuarantineRecord(record: PackageQuarantineRecord): void {
  if (record.subject.packageId !== record.artifactIdentity.packageId) {
    throw new RepositoryWriteConflict('record-validation-failure',
      'Subject packageId does not match artifactIdentity packageId')
  }
  if (!record.trustDecisionRecordId) {
    throw new RepositoryWriteConflict('record-validation-failure', 'Missing trustDecisionRecordId')
  }
  if (!record.quarantineResult?.status) {
    throw new RepositoryWriteConflict('record-validation-failure', 'Missing quarantineResult.status')
  }
  const validStatuses: readonly string[] = ['active', 'released-for-reevaluation', 'destroyed', 'superseded']
  if (!validStatuses.includes(record.quarantineResult.status)) {
    throw new RepositoryWriteConflict('record-validation-failure',
      `Invalid quarantine status: ${record.quarantineResult.status}`)
  }
  if (!record.policyReference?.policyId) {
    throw new RepositoryWriteConflict('record-validation-failure', 'Missing policyReference.policyId')
  }
  if (!record.canonicalDigest) {
    throw new RepositoryWriteConflict('record-validation-failure', 'Missing canonicalDigest')
  }
}
