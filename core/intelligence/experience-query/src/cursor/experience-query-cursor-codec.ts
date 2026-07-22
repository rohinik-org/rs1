import type { ExperienceQueryCursorPayload, NormalizedExperienceQuery } from '@rohinik-org/experience-query-ir'
import { computeExperienceQueryHash } from '@rohinik-org/experience-query-ir'
import { ExperienceQueryValidationError } from '../errors/index.js'

export class ExperienceQueryCursorCodec {
  encode(cursor: ExperienceQueryCursorPayload): string {
    return Buffer.from(JSON.stringify(cursor)).toString('base64url')
  }

  decode(encoded: string, expectedQueryHash: string): ExperienceQueryCursorPayload {
    let payload: ExperienceQueryCursorPayload
    try {
      payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as ExperienceQueryCursorPayload
    } catch {
      throw new ExperienceQueryValidationError('Malformed cursor: cannot decode')
    }
    if (payload.version !== '1') {
      throw new ExperienceQueryValidationError(`Unsupported cursor version: ${payload.version}`)
    }
    if (payload.queryHash !== expectedQueryHash) {
      throw new ExperienceQueryValidationError('Cursor query hash mismatch — cursor belongs to a different query')
    }
    return payload
  }

  // Convenience: compute hash from normalized query (delegates to single canonical impl)
  hashFor(norm: NormalizedExperienceQuery): string {
    return computeExperienceQueryHash(norm)
  }
}
