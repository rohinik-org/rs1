import { mkdirSync, statSync } from 'node:fs'
import { dirname } from 'node:path'
import { createHash } from 'node:crypto'
import Database from 'better-sqlite3'
import type { ExperienceRecord } from '@rohinik-org/experience-ir'
import type { ExperienceWriter, ExperienceReader, RepositoryCommit } from '@rohinik-org/experience-store-ir'
import type {
  ExperienceQuery,
  ExperienceQueryResult,
  ExperienceMetadataProjection,
  NormalizedExperienceQuery,
  ExperienceQueryCursorPayload,
} from '@rohinik-org/experience-query-ir'
import {
  ExperienceQueryOrderField,
  QueryDirection,
  ExperienceProjection,
  QUERY_MAX_LIMIT,
  QUERY_MIN_LIMIT,
  computeExperienceQueryHash,
} from '@rohinik-org/experience-query-ir'
import { ExperienceQueryValidationError, ExperienceQueryIntegrityError, ExperienceQueryUnavailableError } from '@rohinik-org/experience-query'
import { ExperienceQueryNormalizer } from '@rohinik-org/experience-query'
import { ExperienceQueryCursorCodec } from '@rohinik-org/experience-query'

const SCHEMA_EXPERIENCES = `
CREATE TABLE IF NOT EXISTS experiences (
  experience_id        TEXT NOT NULL,
  evaluation_record_id TEXT NOT NULL,
  schema_version       TEXT NOT NULL,
  capture_version      TEXT NOT NULL,
  repository_version   TEXT NOT NULL,
  payload              TEXT NOT NULL,
  payload_hash         TEXT NOT NULL,
  created_at           TEXT NOT NULL,

  PRIMARY KEY (experience_id),
  UNIQUE (evaluation_record_id)
);
`

const SCHEMA_QUERY_INDEX = `
CREATE TABLE IF NOT EXISTS experience_query_index (
  experience_id        TEXT NOT NULL,
  evaluation_record_id TEXT NOT NULL,
  intent_hash          TEXT NOT NULL,
  capability_hash      TEXT NOT NULL,
  plan_hash            TEXT NOT NULL,
  policy_fingerprint   TEXT NOT NULL,
  schema_version       TEXT NOT NULL,
  capture_version      TEXT NOT NULL,
  repository_version   TEXT NOT NULL,
  produced_at          TEXT NOT NULL,
  stored_at            TEXT NOT NULL,

  PRIMARY KEY (experience_id),
  FOREIGN KEY (experience_id) REFERENCES experiences(experience_id)
);

CREATE INDEX IF NOT EXISTS idx_experience_query_produced
  ON experience_query_index(produced_at, experience_id);

CREATE INDEX IF NOT EXISTS idx_experience_query_stored
  ON experience_query_index(stored_at, experience_id);

CREATE INDEX IF NOT EXISTS idx_experience_query_intent
  ON experience_query_index(intent_hash, produced_at, experience_id);

CREATE INDEX IF NOT EXISTS idx_experience_query_capability
  ON experience_query_index(capability_hash, produced_at, experience_id);

CREATE INDEX IF NOT EXISTS idx_experience_query_plan
  ON experience_query_index(plan_hash, produced_at, experience_id);

CREATE INDEX IF NOT EXISTS idx_experience_query_policy
  ON experience_query_index(policy_fingerprint, produced_at, experience_id);

CREATE INDEX IF NOT EXISTS idx_experience_query_evaluation
  ON experience_query_index(evaluation_record_id);
`

// Add payload_hash column to existing databases that pre-date it
const SCHEMA_MIGRATE_PAYLOAD_HASH = `
ALTER TABLE experiences ADD COLUMN payload_hash TEXT NOT NULL DEFAULT '';
`

type IndexRow = {
  experience_id: string
  evaluation_record_id: string
  intent_hash: string
  capability_hash: string
  plan_hash: string
  policy_fingerprint: string
  schema_version: string
  capture_version: string
  repository_version: string
  produced_at: string
  stored_at: string
}

const normalizer = new ExperienceQueryNormalizer()
const cursorCodec = new ExperienceQueryCursorCodec()

function payloadHash(payload: string): string {
  return createHash('sha256').update(payload).digest('hex')
}

export class LocalExperienceRepository implements ExperienceWriter, ExperienceReader {
  static readonly REPOSITORY_VERSION = '1.1.0'
  private db: Database.Database | undefined

  constructor(private readonly dbPath: string) {}

  async initialize(): Promise<void> {
    mkdirSync(dirname(this.dbPath), { recursive: true })
    this.db = new Database(this.dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.exec(SCHEMA_EXPERIENCES)
    // Migrate: add payload_hash if missing
    const cols = (this.db.pragma('table_info(experiences)') as Array<{ name: string }>).map(c => c.name)
    if (!cols.includes('payload_hash')) {
      this.db.exec(SCHEMA_MIGRATE_PAYLOAD_HASH)
    }
    this.db.exec(SCHEMA_QUERY_INDEX)
    this._backfill()
  }

  // ─── Write ────────────────────────────────────────────────────────────────

  async append(record: ExperienceRecord): Promise<RepositoryCommit> {
    const db = this._db()
    const createdAt = this._dbNow(db)
    const payload = JSON.stringify(record, (_k, v) => v instanceof Date ? v.toISOString() : v)
    const hash = payloadHash(payload)

    try {
      db.transaction(() => {
        db.prepare(
          `INSERT INTO experiences (experience_id, evaluation_record_id, schema_version, capture_version, repository_version, payload, payload_hash, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          record.experienceId, record.evaluationRecordId,
          record.metadata.schemaVersion, record.metadata.captureVersion,
          LocalExperienceRepository.REPOSITORY_VERSION, payload, hash, createdAt,
        )
        db.prepare(
          `INSERT INTO experience_query_index
           (experience_id, evaluation_record_id, intent_hash, capability_hash, plan_hash, policy_fingerprint,
            schema_version, capture_version, repository_version, produced_at, stored_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          record.experienceId, record.evaluationRecordId,
          record.fingerprint.intentHash, record.fingerprint.capabilityHash,
          record.fingerprint.planHash, record.fingerprint.evaluationFingerprint,
          record.metadata.schemaVersion, record.metadata.captureVersion,
          LocalExperienceRepository.REPOSITORY_VERSION,
          record.producedAt instanceof Date ? record.producedAt.toISOString() : String(record.producedAt),
          createdAt,
        )
      })()

      return {
        experienceId: record.experienceId,
        storedAt: new Date(createdAt),
        status: 'CREATED',
        repositoryVersion: LocalExperienceRepository.REPOSITORY_VERSION,
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('UNIQUE constraint failed')) {
        const row = (
          db.prepare(`SELECT experience_id, payload_hash, created_at FROM experiences WHERE experience_id = ?`).get(record.experienceId)
          ?? db.prepare(`SELECT experience_id, payload_hash, created_at FROM experiences WHERE evaluation_record_id = ?`).get(record.evaluationRecordId)
        ) as { experience_id: string; payload_hash: string; created_at: string } | undefined

        if (!row) throw new ExperienceQueryIntegrityError(`UNIQUE conflict but canonical row not found for ${record.experienceId}`)

        // P0: content-based idempotency — same payload hash = legitimate replay
        if (row.payload_hash && row.payload_hash !== '' && row.payload_hash !== hash) {
          throw new ExperienceQueryIntegrityError(
            `Identity collision: experience_id or evaluation_record_id already exists with different content (${record.experienceId})`
          )
        }

        // Repair index if missing (Law 64)
        const hasIndex = db.prepare(`SELECT 1 FROM experience_query_index WHERE experience_id = ?`).get(row.experience_id)
        if (!hasIndex) this._insertIndexRow(db, record, row.created_at)
        return {
          experienceId: row.experience_id,
          storedAt: new Date(row.created_at),
          status: 'ALREADY_EXISTS',
          repositoryVersion: LocalExperienceRepository.REPOSITORY_VERSION,
        }
      }
      throw err
    }
  }

  // ─── Read ──────────────────────────────────────────────────────────────────

  async query(query: ExperienceQuery): Promise<ExperienceQueryResult> {
    const db = this._db()
    const norm = normalizer.normalize(query)
    const queryHash = computeExperienceQueryHash(norm)

    // P1: snapshot from DB clock, not application clock
    const snapshotAt = query.page?.cursor
      ? new Date(cursorCodec.decode(query.page.cursor, queryHash).snapshotAt)
      : new Date(this._dbNow(db))

    const limit = Math.max(QUERY_MIN_LIMIT, Math.min(QUERY_MAX_LIMIT, norm.page.limit))

    // P0: fetch limit+1 to determine if another page exists
    const { sql, params } = this._buildQuery(norm, queryHash, snapshotAt, limit + 1)
    const rawRows = db.prepare(sql).all(...params) as IndexRow[]

    const hasMore = rawRows.length > limit
    const rows = hasMore ? rawRows.slice(0, limit) : rawRows

    const nextCursor = hasMore
      ? this._encodeCursor(norm, queryHash, snapshotAt, rows[rows.length - 1]!)
      : undefined

    let items: readonly (ExperienceMetadataProjection | ExperienceRecord)[]
    if (norm.projection === ExperienceProjection.FULL) {
      items = rows.map((r) => this._hydrateRecord(db, r))
    } else {
      items = rows.map((r) => this._toMetadata(r))
    }

    return Object.freeze({
      items: Object.freeze(items),
      snapshotAt,
      returnedCount: items.length,
      ...(nextCursor ? { nextCursor } : {}),
    })
  }

  async getById(experienceId: string): Promise<ExperienceRecord | undefined> {
    const db = this._db()
    const row = db.prepare(`SELECT payload FROM experiences WHERE experience_id = ?`).get(experienceId) as { payload: string } | undefined
    if (!row) return undefined
    return this._parsePayload(experienceId, row.payload)
  }

  async close(): Promise<void> {
    this.db?.close()
    this.db = undefined
  }

  // ─── HTTP helpers (not on interfaces) ─────────────────────────────────────

  getStats(): { totalStored: number; dbPath: string; dbSizeBytes?: number } {
    const row = this._db().prepare('SELECT COUNT(*) as count FROM experiences').get() as { count: number }
    try {
      return { totalStored: row.count, dbPath: this.dbPath, dbSizeBytes: statSync(this.dbPath).size }
    } catch {
      return { totalStored: row.count, dbPath: this.dbPath }
    }
  }

  isWritable(): boolean {
    try { this._db().prepare('SELECT 1').get(); return true } catch { return false }
  }

  // ─── Internals ─────────────────────────────────────────────────────────────

  private _db(): Database.Database {
    if (!this.db) throw new ExperienceQueryUnavailableError('Repository not initialized or already closed')
    return this.db
  }

  // P1: DB clock for consistent snapshot timestamps
  private _dbNow(db: Database.Database): string {
    const row = db.prepare(`SELECT strftime('%Y-%m-%dT%H:%M:%fZ', 'now') as now`).get() as { now: string }
    return row.now
  }

  // P0: loop until all unindexed rows are processed, restart-safe via INSERT OR IGNORE
  private _backfill(): void {
    const db = this.db!
    while (true) {
      const unindexed = db.prepare(
        `SELECT e.experience_id, e.payload, e.created_at
         FROM experiences e
         LEFT JOIN experience_query_index i ON e.experience_id = i.experience_id
         WHERE i.experience_id IS NULL
         LIMIT 500`
      ).all() as { experience_id: string; payload: string; created_at: string }[]

      if (unindexed.length === 0) break

      for (const row of unindexed) {
        try {
          const record = this._parsePayload(row.experience_id, row.payload)
          this._insertIndexRow(db, record, row.created_at)
        } catch { /* skip corrupt rows — Stage 11D handles governance */ }
      }
    }
  }

  private _insertIndexRow(db: Database.Database, record: ExperienceRecord, storedAt: string): void {
    db.prepare(
      `INSERT OR IGNORE INTO experience_query_index
       (experience_id, evaluation_record_id, intent_hash, capability_hash, plan_hash, policy_fingerprint,
        schema_version, capture_version, repository_version, produced_at, stored_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      record.experienceId, record.evaluationRecordId,
      record.fingerprint.intentHash, record.fingerprint.capabilityHash,
      record.fingerprint.planHash, record.fingerprint.evaluationFingerprint,
      record.metadata.schemaVersion, record.metadata.captureVersion,
      LocalExperienceRepository.REPOSITORY_VERSION,
      record.producedAt instanceof Date ? record.producedAt.toISOString() : String(record.producedAt),
      storedAt,
    )
  }

  private _buildQuery(
    norm: NormalizedExperienceQuery,
    queryHash: string,
    snapshotAt: Date,
    limit: number,
  ): { sql: string; params: unknown[] } {
    const conditions: string[] = [`i.stored_at <= ?`]
    const params: unknown[] = [snapshotAt.toISOString()]

    const f = norm.filter
    if (f.experienceIds?.length) {
      conditions.push(`i.experience_id IN (${f.experienceIds.map(() => '?').join(',')})`)
      params.push(...f.experienceIds)
    }
    if (f.evaluationRecordIds?.length) {
      conditions.push(`i.evaluation_record_id IN (${f.evaluationRecordIds.map(() => '?').join(',')})`)
      params.push(...f.evaluationRecordIds)
    }
    if (f.intentHash) { conditions.push(`i.intent_hash = ?`); params.push(f.intentHash) }
    if (f.capabilityHash) { conditions.push(`i.capability_hash = ?`); params.push(f.capabilityHash) }
    if (f.planHash) { conditions.push(`i.plan_hash = ?`); params.push(f.planHash) }
    if (f.policyFingerprint) { conditions.push(`i.policy_fingerprint = ?`); params.push(f.policyFingerprint) }
    if (f.schemaVersions?.length) {
      conditions.push(`i.schema_version IN (${f.schemaVersions.map(() => '?').join(',')})`)
      params.push(...f.schemaVersions)
    }
    if (f.captureVersions?.length) {
      conditions.push(`i.capture_version IN (${f.captureVersions.map(() => '?').join(',')})`)
      params.push(...f.captureVersions)
    }
    // P2: from inclusive, to exclusive
    if (f.producedAt?.from) { conditions.push(`i.produced_at >= ?`); params.push(f.producedAt.from.toISOString()) }
    if (f.producedAt?.to) { conditions.push(`i.produced_at < ?`); params.push(f.producedAt.to.toISOString()) }
    if (f.storedAt?.from) { conditions.push(`i.stored_at >= ?`); params.push(f.storedAt.from.toISOString()) }
    if (f.storedAt?.to) { conditions.push(`i.stored_at < ?`); params.push(f.storedAt.to.toISOString()) }

    // P0: keyset cursor — DESC primary sort, ASC experience_id tie-break (always ASC)
    if (norm.page.cursor) {
      const cursor = cursorCodec.decode(norm.page.cursor, queryHash)
      const col = this._orderCol(norm.order.field)
      // Tie-break: experience_id is always ascending regardless of primary direction
      if (norm.order.direction === QueryDirection.DESC) {
        conditions.push(`(i.${col} < ? OR (i.${col} = ? AND i.experience_id > ?))`)
      } else {
        conditions.push(`(i.${col} > ? OR (i.${col} = ? AND i.experience_id > ?))`)
      }
      params.push(cursor.lastSortValue, cursor.lastSortValue, cursor.lastExperienceId)
    }

    const orderCol = this._orderCol(norm.order.field)
    const dir = norm.order.direction

    const sql = `
      SELECT i.*
      FROM experience_query_index i
      WHERE ${conditions.join(' AND ')}
      ORDER BY i.${orderCol} ${dir}, i.experience_id ASC
      LIMIT ?
    `
    params.push(limit)

    return { sql, params }
  }

  private _orderCol(field: string): string {
    switch (field) {
      case ExperienceQueryOrderField.STORED_AT: return 'stored_at'
      case ExperienceQueryOrderField.EXPERIENCE_ID: return 'experience_id'
      default: return 'produced_at'
    }
  }

  private _encodeCursor(
    norm: NormalizedExperienceQuery,
    queryHash: string,
    snapshotAt: Date,
    last: IndexRow,
  ): string {
    const sortVal = norm.order.field === ExperienceQueryOrderField.STORED_AT
      ? last.stored_at
      : norm.order.field === ExperienceQueryOrderField.EXPERIENCE_ID
        ? last.experience_id
        : last.produced_at
    const payload: ExperienceQueryCursorPayload = {
      version: '1',
      queryHash,
      snapshotAt: snapshotAt.toISOString(),
      orderField: norm.order.field,
      direction: norm.order.direction,
      lastSortValue: sortVal,
      lastExperienceId: last.experience_id,
    }
    return cursorCodec.encode(payload)
  }

  private _toMetadata(row: IndexRow): ExperienceMetadataProjection {
    return Object.freeze({
      experienceId: row.experience_id,
      evaluationRecordId: row.evaluation_record_id,
      intentHash: row.intent_hash,
      capabilityHash: row.capability_hash,
      planHash: row.plan_hash,
      policyFingerprint: row.policy_fingerprint,
      schemaVersion: row.schema_version,
      captureVersion: row.capture_version,
      repositoryVersion: row.repository_version,
      producedAt: new Date(row.produced_at),
      storedAt: new Date(row.stored_at),
    })
  }

  private _hydrateRecord(db: Database.Database, indexRow: IndexRow): ExperienceRecord {
    const canonical = db.prepare(`SELECT payload FROM experiences WHERE experience_id = ?`).get(indexRow.experience_id) as { payload: string } | undefined
    if (!canonical) throw new ExperienceQueryIntegrityError(`Canonical payload missing for ${indexRow.experience_id}`)
    const record = this._parsePayload(indexRow.experience_id, canonical.payload)
    // P1: verify indexed identity matches payload (Law 65)
    if (record.experienceId !== indexRow.experience_id) {
      throw new ExperienceQueryIntegrityError(`Index/payload experienceId mismatch: ${indexRow.experience_id} vs ${record.experienceId}`)
    }
    if (record.evaluationRecordId !== indexRow.evaluation_record_id) {
      throw new ExperienceQueryIntegrityError(`Index/payload evaluationRecordId mismatch: ${indexRow.evaluation_record_id} vs ${record.evaluationRecordId}`)
    }
    return record
  }

  // P1: full payload reconstruction — validates dates, fingerprint, freezes result
  private _parsePayload(experienceId: string, raw: string): ExperienceRecord {
    try {
      const obj = JSON.parse(raw, (_k, v) => {
        if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) return new Date(v)
        return v
      }) as Record<string, unknown>

      if (obj['experienceId'] !== experienceId) {
        throw new ExperienceQueryIntegrityError(`Payload experienceId mismatch`)
      }

      // Validate fingerprint.experienceId matches
      const fp = obj['fingerprint'] as Record<string, unknown> | undefined
      if (!fp || fp['experienceId'] !== experienceId) {
        throw new ExperienceQueryIntegrityError(`Payload fingerprint.experienceId mismatch for ${experienceId}`)
      }

      // Validate producedAt is a real Date
      if (!(obj['producedAt'] instanceof Date) || isNaN((obj['producedAt'] as Date).getTime())) {
        throw new ExperienceQueryIntegrityError(`Payload producedAt is not a valid date for ${experienceId}`)
      }

      return Object.freeze(obj) as unknown as ExperienceRecord
    } catch (err) {
      if (err instanceof ExperienceQueryIntegrityError) throw err
      throw new ExperienceQueryIntegrityError(`Cannot parse canonical payload for ${experienceId}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
}
