import type { Matcher, MatchContext, MatchResult } from './matcher.js'
import type { RoutingRequest } from '../domain/request.js'

export type ExactTarget = 'intentHint' | 'content' | 'contentType'

// Case-insensitive exact string equality on a request field.
export class ExactMatcher implements Matcher {
  readonly id = 'exact' as const
  readonly value: string
  readonly target: ExactTarget

  constructor(value: string, target: ExactTarget = 'intentHint') {
    this.value = value.toLowerCase()
    this.target = target
  }

  match(request: RoutingRequest, _context?: MatchContext): MatchResult {
    const raw = this.readField(request)
    const actual = (raw ?? '').toLowerCase()
    if (actual === this.value) {
      return {
        matched: true,
        rawConfidence: 1.0,
        matcherId: this.id,
        explanation: {
          code: 'MATCH.EXACT',
          message: `${this.target} equals '${this.value}'`,
          data: { value: this.value, target: this.target },
        },
      }
    }
    return {
      matched: false,
      rawConfidence: 0,
      matcherId: this.id,
      explanation: {
        code: 'MISS.EXACT',
        message: `${this.target} is '${actual}', expected '${this.value}'`,
        data: { expected: this.value, actual, target: this.target },
      },
    }
  }

  private readField(request: RoutingRequest): string | undefined {
    switch (this.target) {
      case 'intentHint': return request.intentHint
      case 'content': return request.content
      case 'contentType': return request.contentType
    }
  }
}
