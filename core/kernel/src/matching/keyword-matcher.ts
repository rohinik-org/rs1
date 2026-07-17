import type { Matcher, MatchContext, MatchResult } from './matcher.js'
import type { RoutingRequest } from '../domain/request.js'
import { DEFAULT_TOKENIZER, type Tokenizer } from './tokenizer.js'

export type KeywordTarget = 'intentHint' | 'content'

// Whole-word keyword matching against a request field. Immutable, pure.
//
// Rationale for whole-word (not substring) matching:
//   "summarize" MUST NOT match "sum".
//   "sorting" MUST NOT match "sort".
// See FIRST-RUN-FINDINGS.md FINDING-2 for context.
export class KeywordMatcher implements Matcher {
  readonly id = 'keyword' as const
  readonly keywords: readonly string[]
  readonly target: KeywordTarget
  readonly tokenizer: Tokenizer

  constructor(
    keywords: readonly string[],
    target: KeywordTarget = 'intentHint',
    tokenizer: Tokenizer = DEFAULT_TOKENIZER,
  ) {
    if (keywords.length === 0) {
      throw new Error('KeywordMatcher requires at least one keyword')
    }
    this.keywords = Object.freeze(keywords.map(k => k.toLowerCase()))
    this.target = target
    this.tokenizer = tokenizer
  }

  match(request: RoutingRequest, _context?: MatchContext): MatchResult {
    const raw = this.target === 'intentHint' ? request.intentHint : request.content
    const tokens = this.tokenizer.tokenize(raw ?? '')
    const tokenValues = tokens.map(t => t.value)

    for (const keyword of this.keywords) {
      if (tokenValues.includes(keyword)) {
        return {
          matched: true,
          rawConfidence: 1.0,
          matcherId: this.id,
          explanation: {
            code: 'MATCH.KEYWORD',
            message: `Matched keyword '${keyword}' in ${this.target}`,
            data: { keyword, target: this.target },
          },
          evidence: {
            matchedToken: keyword,
            target: this.target,
            allTokens: tokenValues,
          },
        }
      }
    }

    return {
      matched: false,
      rawConfidence: 0,
      matcherId: this.id,
      explanation: {
        code: 'MISS.KEYWORD',
        message: `No keyword from [${this.keywords.join(', ')}] found in ${this.target}`,
        data: { keywords: [...this.keywords], target: this.target },
      },
    }
  }
}
