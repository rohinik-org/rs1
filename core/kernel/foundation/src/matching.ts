// Matcher interfaces exposed via the SDK so extensions can declare
// matching metadata without importing from @rohinik-org/kernel.
//
// These interface definitions are duplicated (not re-exported) from the
// kernel's `matching/matcher.ts` — this is the same pattern already used
// for `SkillMetadata` and `Skill`. The kernel's structural types match
// these SDK types, so a matcher declared here is directly usable in the
// kernel.

import type { ExecutionContext } from './skill-context.js'

// The RoutingRequest a matcher inspects. Mirrors packages/kernel/src/domain/request.ts.
// Extensions typically receive this via ExecutionContext.request.
export interface MatcherRoutingRequest {
  readonly content: string
  readonly contentType: string
  readonly intentHint?: string
  readonly context: Readonly<Record<string, unknown>>
}

export type MatcherId =
  | 'keyword'
  | 'exact'
  | 'content-type'
  | 'all-of'
  | 'any-of'

export type MatchExplanationCode =
  | 'MATCH.KEYWORD'
  | 'MATCH.EXACT'
  | 'MATCH.CONTENT_TYPE'
  | 'MATCH.ALL'
  | 'MATCH.ANY'
  | 'MISS.KEYWORD'
  | 'MISS.EXACT'
  | 'MISS.CONTENT_TYPE'
  | 'MISS.ALL_REQUIRED'
  | 'MISS.ANY'

export interface MatchExplanation {
  readonly code: MatchExplanationCode
  readonly message: string
  readonly data?: Readonly<Record<string, unknown>>
}

export interface MatchResult {
  readonly matched: boolean
  readonly rawConfidence: number
  readonly matcherId: MatcherId
  readonly explanation: MatchExplanation
  readonly evidence?: Readonly<Record<string, unknown>>
}

export interface MatchContext {
  readonly _reserved?: never
}

export interface Matcher {
  readonly id: MatcherId
  match(request: MatcherRoutingRequest, context?: MatchContext): MatchResult
}

export interface SkillMatchingMetadata {
  readonly matcher: Matcher
}

// ExecutionContext is only used indirectly (matchers get the request).
// This import prevents unused-type stripping at build time.
export type _EnsureContextType = ExecutionContext
