import type { ExperienceRecord } from '@rohinik-org/experience-ir'
import { createHash } from 'node:crypto'

export interface ExperienceTimeRange {
  readonly from?: Date
  readonly to?: Date
}

export interface ExperienceQueryFilter {
  readonly experienceIds?: readonly string[]
  readonly evaluationRecordIds?: readonly string[]
  readonly intentHash?: string
  readonly capabilityHash?: string
  readonly planHash?: string
  readonly policyFingerprint?: string
  readonly schemaVersions?: readonly string[]
  readonly captureVersions?: readonly string[]
  readonly producedAt?: ExperienceTimeRange
  readonly storedAt?: ExperienceTimeRange
}

export const ExperienceQueryOrderField = Object.freeze({
  PRODUCED_AT: 'PRODUCED_AT',
  STORED_AT: 'STORED_AT',
  EXPERIENCE_ID: 'EXPERIENCE_ID',
} as const)
export type ExperienceQueryOrderField = typeof ExperienceQueryOrderField[keyof typeof ExperienceQueryOrderField]

export const QueryDirection = Object.freeze({
  ASC: 'ASC',
  DESC: 'DESC',
} as const)
export type QueryDirection = typeof QueryDirection[keyof typeof QueryDirection]

export interface ExperienceQueryOrder {
  readonly field: ExperienceQueryOrderField
  readonly direction: QueryDirection
}

export interface ExperienceQueryPage {
  readonly limit?: number
  readonly cursor?: string
}

export const ExperienceProjection = Object.freeze({
  METADATA: 'METADATA',
  FULL: 'FULL',
} as const)
export type ExperienceProjection = typeof ExperienceProjection[keyof typeof ExperienceProjection]

export interface ExperienceMetadataProjection {
  readonly experienceId: string
  readonly evaluationRecordId: string
  readonly intentHash: string
  readonly capabilityHash: string
  readonly planHash: string
  readonly policyFingerprint: string
  readonly schemaVersion: string
  readonly captureVersion: string
  readonly repositoryVersion: string
  readonly producedAt: Date
  readonly storedAt: Date
}

export interface ExperienceQuery {
  readonly filter?: ExperienceQueryFilter
  readonly order?: ExperienceQueryOrder
  readonly page?: ExperienceQueryPage
  readonly projection?: ExperienceProjection
}

export interface ExperienceQueryResult<
  T = ExperienceMetadataProjection | ExperienceRecord
> {
  readonly items: readonly T[]
  readonly nextCursor?: string
  readonly snapshotAt: Date
  readonly returnedCount: number
}

export interface ExperienceQueryCursorPayload {
  readonly version: '1'
  readonly queryHash: string
  readonly snapshotAt: string
  readonly orderField: ExperienceQueryOrderField
  readonly direction: QueryDirection
  readonly lastSortValue: string
  readonly lastExperienceId: string
}

export interface NormalizedExperienceQuery {
  readonly filter: ExperienceQueryFilter
  readonly order: ExperienceQueryOrder
  readonly page: Required<Omit<ExperienceQueryPage, 'cursor'>> & { readonly cursor?: string }
  readonly projection: ExperienceProjection
}

export interface ExperienceQueryTelemetry {
  readonly queryHash: string
  readonly projection: ExperienceProjection
  readonly returnedCount: number
  readonly durationMs: number
  readonly cursorUsed: boolean
  readonly nextCursorProduced: boolean
  readonly completedAt: Date
}

export interface ExperienceQueryTelemetrySink {
  record(entry: ExperienceQueryTelemetry): void
}

export const QUERY_DEFAULT_LIMIT = 50
export const QUERY_MIN_LIMIT = 1
export const QUERY_MAX_LIMIT = 200
export const QUERY_MAX_IDS = 200
export const QUERY_MAX_VERSIONS = 20

// Canonical query hash — excludes cursor and page.limit (limit may vary across pages).
// Single authoritative implementation used by codec, engine, and repository.
export function computeExperienceQueryHash(norm: NormalizedExperienceQuery): string {
  const canonical = JSON.stringify({
    filter: norm.filter,
    order: norm.order,
    projection: norm.projection,
  })
  return createHash('sha256').update(canonical).digest('hex')
}
