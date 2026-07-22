import type {
  ExperienceQuery,
  NormalizedExperienceQuery,
  ExperienceQueryFilter,
} from '@rohinik-org/experience-query-ir'
import {
  ExperienceQueryOrderField,
  QueryDirection,
  ExperienceProjection,
  QUERY_DEFAULT_LIMIT,
} from '@rohinik-org/experience-query-ir'

export class ExperienceQueryNormalizer {
  normalize(query: ExperienceQuery): NormalizedExperienceQuery {
    const filter = this._normalizeFilter(query.filter ?? {})
    const order = Object.freeze(query.order ?? {
      field: ExperienceQueryOrderField.PRODUCED_AT,
      direction: QueryDirection.DESC,
    })
    const limit = query.page?.limit ?? QUERY_DEFAULT_LIMIT
    const page = Object.freeze({
      limit,
      ...(query.page?.cursor ? { cursor: query.page.cursor } : {}),
    })
    const projection = query.projection ?? ExperienceProjection.METADATA
    return Object.freeze({ filter, order, page, projection })
  }

  private _normalizeFilter(f: ExperienceQueryFilter): ExperienceQueryFilter {
    return Object.freeze({
      ...(f.experienceIds ? {
        experienceIds: Object.freeze([...new Set(f.experienceIds)].sort())
      } : {}),
      ...(f.evaluationRecordIds ? {
        evaluationRecordIds: Object.freeze([...new Set(f.evaluationRecordIds)].sort())
      } : {}),
      ...(f.intentHash ? { intentHash: f.intentHash } : {}),
      ...(f.capabilityHash ? { capabilityHash: f.capabilityHash } : {}),
      ...(f.planHash ? { planHash: f.planHash } : {}),
      ...(f.policyFingerprint ? { policyFingerprint: f.policyFingerprint } : {}),
      ...(f.schemaVersions ? {
        schemaVersions: Object.freeze([...new Set(f.schemaVersions)].sort())
      } : {}),
      ...(f.captureVersions ? {
        captureVersions: Object.freeze([...new Set(f.captureVersions)].sort())
      } : {}),
      ...(f.producedAt ? { producedAt: Object.freeze(f.producedAt) } : {}),
      ...(f.storedAt ? { storedAt: Object.freeze(f.storedAt) } : {}),
    })
  }
}
