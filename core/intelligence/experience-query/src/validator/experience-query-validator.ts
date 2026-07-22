import type { ExperienceQuery } from '@rohinik-org/experience-query-ir'
import { QUERY_MIN_LIMIT, QUERY_MAX_LIMIT, QUERY_MAX_IDS, QUERY_MAX_VERSIONS } from '@rohinik-org/experience-query-ir'
import { ExperienceQueryValidationError } from '../errors/index.js'

const HEX64 = /^[0-9a-f]{64}$/

export class ExperienceQueryValidator {
  validate(query: ExperienceQuery): void {
    if (query.page?.limit !== undefined) {
      if (!Number.isInteger(query.page.limit) || query.page.limit < QUERY_MIN_LIMIT || query.page.limit > QUERY_MAX_LIMIT) {
        throw new ExperienceQueryValidationError(`Page limit must be ${QUERY_MIN_LIMIT}–${QUERY_MAX_LIMIT}, got ${query.page.limit}`)
      }
    }

    const f = query.filter
    if (!f) return

    if (f.experienceIds && f.experienceIds.length > QUERY_MAX_IDS) {
      throw new ExperienceQueryValidationError(`experienceIds exceeds maximum of ${QUERY_MAX_IDS}`)
    }
    if (f.evaluationRecordIds && f.evaluationRecordIds.length > QUERY_MAX_IDS) {
      throw new ExperienceQueryValidationError(`evaluationRecordIds exceeds maximum of ${QUERY_MAX_IDS}`)
    }
    if (f.schemaVersions && f.schemaVersions.length > QUERY_MAX_VERSIONS) {
      throw new ExperienceQueryValidationError(`schemaVersions exceeds maximum of ${QUERY_MAX_VERSIONS}`)
    }
    if (f.captureVersions && f.captureVersions.length > QUERY_MAX_VERSIONS) {
      throw new ExperienceQueryValidationError(`captureVersions exceeds maximum of ${QUERY_MAX_VERSIONS}`)
    }

    for (const field of ['intentHash', 'capabilityHash', 'planHash', 'policyFingerprint'] as const) {
      const v = f[field]
      if (v !== undefined && !HEX64.test(v)) {
        throw new ExperienceQueryValidationError(`${field} must be a 64-char lowercase hex string`)
      }
    }

    if (f.producedAt) {
      if (f.producedAt.from && !(f.producedAt.from instanceof Date) || (f.producedAt.from && isNaN(f.producedAt.from.getTime()))) {
        throw new ExperienceQueryValidationError('producedAt.from is not a valid Date')
      }
      if (f.producedAt.to && !(f.producedAt.to instanceof Date) || (f.producedAt.to && isNaN(f.producedAt.to.getTime()))) {
        throw new ExperienceQueryValidationError('producedAt.to is not a valid Date')
      }
      if (f.producedAt.from && f.producedAt.to && f.producedAt.from >= f.producedAt.to) {
        throw new ExperienceQueryValidationError('producedAt.from must be before producedAt.to')
      }
    }
    if (f.storedAt) {
      if (f.storedAt.from && !(f.storedAt.from instanceof Date) || (f.storedAt.from && isNaN(f.storedAt.from.getTime()))) {
        throw new ExperienceQueryValidationError('storedAt.from is not a valid Date')
      }
      if (f.storedAt.to && !(f.storedAt.to instanceof Date) || (f.storedAt.to && isNaN(f.storedAt.to.getTime()))) {
        throw new ExperienceQueryValidationError('storedAt.to is not a valid Date')
      }
      if (f.storedAt.from && f.storedAt.to && f.storedAt.from >= f.storedAt.to) {
        throw new ExperienceQueryValidationError('storedAt.from must be before storedAt.to')
      }
    }
  }
}
