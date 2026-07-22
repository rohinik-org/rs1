import { mkdirSync, statSync } from 'node:fs'
import { dirname } from 'node:path'
import Database from 'better-sqlite3'
import type { ExperienceRecord } from '@rohinik-org/experience-ir'
import type { ExperienceWriter, RepositoryCommit } from '@rohinik-org/experience-store-ir'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS experiences (
  experience_id        TEXT NOT NULL,
  evaluation_record_id TEXT NOT NULL,
  schema_version       TEXT NOT NULL,
  capture_version      TEXT NOT NULL,
  repository_version   TEXT NOT NULL,
  payload              TEXT NOT NULL,
  created_at           TEXT NOT NULL,

  PRIMARY KEY (experience_id),
  UNIQUE (evaluation_record_id)
);
`

export class LocalExperienceRepository implements ExperienceWriter {
  static readonly REPOSITORY_VERSION = '1.0.0'
  private db: Database.Database | undefined

  constructor(private readonly dbPath: string) {}

  async initialize(): Promise<void> {
    mkdirSync(dirname(this.dbPath), { recursive: true })
    this.db = new Database(this.dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.exec(SCHEMA)
  }

  async append(record: ExperienceRecord): Promise<RepositoryCommit> {
    const db = this.db!
    const createdAt = new Date().toISOString()
    const payload = JSON.stringify(record, (_k, v) => v instanceof Date ? v.toISOString() : v)

    try {
      db.prepare(
        `INSERT INTO experiences (experience_id, evaluation_record_id, schema_version, capture_version, repository_version, payload, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        record.experienceId,
        record.evaluationRecordId,
        record.metadata.schemaVersion,
        record.metadata.captureVersion,
        LocalExperienceRepository.REPOSITORY_VERSION,
        payload,
        createdAt,
      )
      return {
        experienceId: record.experienceId,
        storedAt: new Date(createdAt),
        status: 'CREATED',
        repositoryVersion: LocalExperienceRepository.REPOSITORY_VERSION,
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('UNIQUE constraint failed')) {
        // May be duplicate on experience_id or evaluation_record_id — look up by both
        const row = (
          db.prepare(`SELECT experience_id, created_at FROM experiences WHERE experience_id = ?`).get(record.experienceId)
          ?? db.prepare(`SELECT experience_id, created_at FROM experiences WHERE evaluation_record_id = ?`).get(record.evaluationRecordId)
        ) as { experience_id: string; created_at: string }
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

  async close(): Promise<void> {
    this.db?.close()
    this.db = undefined
  }

  // ponytail: stats helper used by HTTP route — not on ExperienceWriter interface
  getStats(): { totalStored: number; dbPath: string; dbSizeBytes?: number } {
    const row = this.db!.prepare('SELECT COUNT(*) as count FROM experiences').get() as { count: number }
    try {
      const dbSizeBytes = statSync(this.dbPath).size
      return { totalStored: row.count, dbPath: this.dbPath, dbSizeBytes }
    } catch {
      return { totalStored: row.count, dbPath: this.dbPath }
    }
  }

  isWritable(): boolean {
    try {
      this.db!.prepare('SELECT 1').get()
      return true
    } catch {
      return false
    }
  }
}
