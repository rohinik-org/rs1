import type { Matcher, MatchContext, MatchResult } from './matcher.js'
import type { RoutingRequest } from '../domain/request.js'

// AllOf — matched iff every child matches. rawConfidence is the product of
// child confidences (so a chain of 1.0-confidence matches → 1.0).
export class AllOfMatcher implements Matcher {
  readonly id = 'all-of' as const
  readonly matchers: readonly Matcher[]

  constructor(...matchers: readonly Matcher[]) {
    if (matchers.length === 0) {
      throw new Error('AllOfMatcher requires at least one child matcher')
    }
    this.matchers = Object.freeze([...matchers])
  }

  match(request: RoutingRequest, context?: MatchContext): MatchResult {
    const childResults: MatchResult[] = []
    let product = 1
    for (const m of this.matchers) {
      const r = m.match(request, context)
      childResults.push(r)
      if (!r.matched) {
        return {
          matched: false,
          rawConfidence: 0,
          matcherId: this.id,
          explanation: {
            code: 'MISS.ALL_REQUIRED',
            message: `Required child matcher '${m.id}' did not match: ${r.explanation.message}`,
            data: { failedChild: m.id, failedCode: r.explanation.code },
          },
        }
      }
      product *= r.rawConfidence
    }
    return {
      matched: true,
      rawConfidence: product,
      matcherId: this.id,
      explanation: {
        code: 'MATCH.ALL',
        message: `All ${childResults.length} child matchers matched`,
        data: {
          childCodes: childResults.map(r => r.explanation.code),
        },
      },
    }
  }
}

// AnyOf — matched iff any child matches. rawConfidence is the max of matching
// children.
export class AnyOfMatcher implements Matcher {
  readonly id = 'any-of' as const
  readonly matchers: readonly Matcher[]

  constructor(...matchers: readonly Matcher[]) {
    if (matchers.length === 0) {
      throw new Error('AnyOfMatcher requires at least one child matcher')
    }
    this.matchers = Object.freeze([...matchers])
  }

  match(request: RoutingRequest, context?: MatchContext): MatchResult {
    const childResults: MatchResult[] = []
    let bestConfidence = 0
    let bestCode: string | undefined
    for (const m of this.matchers) {
      const r = m.match(request, context)
      childResults.push(r)
      if (r.matched && r.rawConfidence > bestConfidence) {
        bestConfidence = r.rawConfidence
        bestCode = r.explanation.code
      }
    }
    if (bestCode !== undefined) {
      return {
        matched: true,
        rawConfidence: bestConfidence,
        matcherId: this.id,
        explanation: {
          code: 'MATCH.ANY',
          message: `At least one child matcher matched (best: ${bestCode})`,
          data: {
            bestChildCode: bestCode,
            childCodes: childResults.map(r => r.explanation.code),
          },
        },
      }
    }
    return {
      matched: false,
      rawConfidence: 0,
      matcherId: this.id,
      explanation: {
        code: 'MISS.ANY',
        message: `No child matcher matched`,
        data: {
          childCodes: childResults.map(r => r.explanation.code),
        },
      },
    }
  }
}
