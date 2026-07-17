import type { Matcher, MatchContext, MatchResult } from './matcher.js'
import type { RoutingRequest } from '../domain/request.js'

// Asserts that request.contentType exactly matches the target.
// Case-sensitive because contentTypes are canonical identifiers (TEXT, CSV,
// JSON, FILE), not free-form intent.
export class ContentTypeMatcher implements Matcher {
  readonly id = 'content-type' as const
  readonly contentType: string

  constructor(contentType: string) {
    this.contentType = contentType
  }

  match(request: RoutingRequest, _context?: MatchContext): MatchResult {
    if (request.contentType === this.contentType) {
      return {
        matched: true,
        rawConfidence: 1.0,
        matcherId: this.id,
        explanation: {
          code: 'MATCH.CONTENT_TYPE',
          message: `contentType is '${this.contentType}'`,
          data: { contentType: this.contentType },
        },
      }
    }
    return {
      matched: false,
      rawConfidence: 0,
      matcherId: this.id,
      explanation: {
        code: 'MISS.CONTENT_TYPE',
        message: `contentType is '${request.contentType}', expected '${this.contentType}'`,
        data: { expected: this.contentType, actual: request.contentType },
      },
    }
  }
}
