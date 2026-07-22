import type { ExperienceRecord } from '@rohinik-org/experience-ir'
import type { ExperienceReader } from '@rohinik-org/experience-store-ir'
import type {
  ExperienceQuery,
  ExperienceQueryResult,
  ExperienceQueryTelemetrySink,
  ExperienceQueryTelemetry,
} from '@rohinik-org/experience-query-ir'
import { computeExperienceQueryHash } from '@rohinik-org/experience-query-ir'
import type { ExperienceQueryValidator } from '../validator/experience-query-validator.js'
import type { ExperienceQueryNormalizer } from '../normalizer/experience-query-normalizer.js'

export class ExperienceQueryEngine {
  constructor(
    private readonly validator: ExperienceQueryValidator,
    private readonly normalizer: ExperienceQueryNormalizer,
    private readonly reader: ExperienceReader,
    private readonly telemetry?: ExperienceQueryTelemetrySink,
  ) {}

  async query(request: ExperienceQuery): Promise<ExperienceQueryResult> {
    this.validator.validate(request)
    const norm = this.normalizer.normalize(request)
    const queryHash = computeExperienceQueryHash(norm)
    const t0 = Date.now()
    const result = await this.reader.query(norm)
    const durationMs = Date.now() - t0
    this.telemetry?.record(Object.freeze({
      queryHash,
      projection: norm.projection,
      returnedCount: result.returnedCount,
      durationMs,
      cursorUsed: !!request.page?.cursor,
      nextCursorProduced: !!result.nextCursor,
      completedAt: new Date(),
    } satisfies ExperienceQueryTelemetry))
    return result
  }

  async getById(experienceId: string): Promise<ExperienceRecord | undefined> {
    return this.reader.getById(experienceId)
  }
}
