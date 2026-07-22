import type { EventBus } from '@rohinik-org/kernel'
import type { ExperienceRecord } from '@rohinik-org/experience-ir'
import { ExperienceEvent } from '@rohinik-org/experience-ir'
import type { ExperienceRecordReadyPayload } from '@rohinik-org/experience-ir'
import type { ExperienceWriter } from '@rohinik-org/experience-store-ir'
import {
  ExperienceStoreEvent,
  ExperiencePersistenceError,
  type ExperienceStoredPayload,
  type ExperienceStoreFailedPayload,
} from '@rohinik-org/experience-store-ir'
import type { ExperienceIntegrityValidator } from '../validator/experience-integrity-validator.js'

const RETRY_DELAYS: number[] = [50, 100, 250]
const TRANSIENT = /SQLITE_BUSY|SQLITE_LOCKED|disk I\/O error/i

function isTransient(err: unknown): boolean {
  return err instanceof Error && TRANSIENT.test(err.message)
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export class ExperiencePersistenceCoordinator {
  constructor(
    private readonly validator: ExperienceIntegrityValidator,
    private readonly writer: ExperienceWriter,
    private readonly events: EventBus,
  ) {}

  subscribe(): void {
    this.events.on(ExperienceEvent.EXPERIENCE_RECORD_READY, (data: unknown) => {
      const payload = data as ExperienceRecordReadyPayload
      return this.persist(payload.record)
    })
  }

  private async persist(record: ExperienceRecord): Promise<void> {
    try {
      this.validator.validate(record)
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      const failed: ExperienceStoreFailedPayload = {
        experienceId: record.experienceId,
        reason,
        retryCount: 0,
        timestamp: new Date(),
      }
      this.events.emit(ExperienceStoreEvent.EXPERIENCE_STORE_FAILED, failed)
      throw err
    }

    let lastErr: unknown
    for (let attempt = 0; attempt < RETRY_DELAYS.length; attempt++) {
      try {
        const commit = await this.writer.append(record)
        const stored: ExperienceStoredPayload = { experienceId: record.experienceId, commit }
        this.events.emit(ExperienceStoreEvent.EXPERIENCE_STORED, stored)
        return
      } catch (err) {
        if (!isTransient(err)) {
          const reason = err instanceof Error ? err.message : String(err)
          const failed: ExperienceStoreFailedPayload = {
            experienceId: record.experienceId,
            reason,
            retryCount: attempt,
            timestamp: new Date(),
          }
          this.events.emit(ExperienceStoreEvent.EXPERIENCE_STORE_FAILED, failed)
          throw new ExperiencePersistenceError(reason, record.experienceId, attempt, err)
        }
        lastErr = err
        await sleep(RETRY_DELAYS[attempt]!)
      }
    }

    const reason = lastErr instanceof Error ? lastErr.message : String(lastErr)
    const failed: ExperienceStoreFailedPayload = {
      experienceId: record.experienceId,
      reason,
      retryCount: RETRY_DELAYS.length,
      timestamp: new Date(),
    }
    this.events.emit(ExperienceStoreEvent.EXPERIENCE_STORE_FAILED, failed)
    throw new ExperiencePersistenceError(reason, record.experienceId, RETRY_DELAYS.length, lastErr)
  }
}
