import type { ExperienceRecord } from '@rohinik-org/experience-ir'
import { ExperiencePersistenceError } from '@rohinik-org/experience-store-ir'

export class ExperienceIntegrityValidator {
  validate(record: ExperienceRecord): void {
    if (!record.experienceId || !/^[0-9a-f]{64}$/.test(record.experienceId)) {
      throw new ExperiencePersistenceError(
        `Invalid experienceId: must be 64-char hex`,
        record.experienceId ?? '',
        0,
      )
    }
    if (!record.evaluationRecordId) {
      throw new ExperiencePersistenceError(
        'Missing evaluationRecordId',
        record.experienceId,
        0,
      )
    }
    if (record.fingerprint.experienceId !== record.experienceId) {
      throw new ExperiencePersistenceError(
        `Fingerprint mismatch: fingerprint.experienceId=${record.fingerprint.experienceId} !== ${record.experienceId}`,
        record.experienceId,
        0,
      )
    }
    if (!record.metadata.schemaVersion) {
      throw new ExperiencePersistenceError('Missing metadata.schemaVersion', record.experienceId, 0)
    }
    if (!record.metadata.captureVersion) {
      throw new ExperiencePersistenceError('Missing metadata.captureVersion', record.experienceId, 0)
    }
    if (!(record.producedAt instanceof Date) || isNaN(record.producedAt.getTime())) {
      throw new ExperiencePersistenceError('Invalid producedAt date', record.experienceId, 0)
    }
  }
}
