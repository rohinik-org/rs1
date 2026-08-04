// Matcher — the mechanism by which a Skill declares "when should I be considered?"
//
// Architectural invariants (enforced by convention, verified in tests):
//   1. Matchers are IMMUTABLE value objects. All fields readonly.
//      Combinators freeze their child arrays.
//   2. Matchers are PURE. No network, clock, random, filesystem, or memory
//      lookups. Only the RoutingRequest (and optional MatchContext) may be
//      inspected. Replay determinism depends on this.
//   3. Matchers report a RAW confidence on their own scale. The router's
//      RankingPolicy normalizes across matchers.
//
// Ownership model per AFS-0001 §routing:
//   Capability owns execution metadata (tierId).
//   Skill owns matching metadata (matcher).
//   Router owns scoring (RankingPolicy).

import type { RoutingRequest } from '../domain/request.js'

export type MatcherId =
  | 'keyword'
  | 'exact'
  | 'content-type'
  | 'all-of'
  | 'any-of'
  // Future matchers extend this union via TypeScript module augmentation.

export type MatchExplanationCode =
  // Positive
  | 'MATCH.KEYWORD'
  | 'MATCH.EXACT'
  | 'MATCH.CONTENT_TYPE'
  | 'MATCH.ALL'
  | 'MATCH.ANY'
  // Negative
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
  // Matcher-local scale, not directly comparable across matcher types.
  // RankingPolicy is responsible for normalization.
  readonly rawConfidence: number
  readonly matcherId: MatcherId
  readonly explanation: MatchExplanation
  // Optional raw match data — populated only when it aids downstream
  // Explainability / Stage 5 learning. Sparse by design.
  readonly evidence?: Readonly<Record<string, unknown>>
}

// MatchContext — optional second argument to match(). Reserved for future
// stages. Documented shape (not yet implemented):
//
//   readonly providerHints?: readonly string[]      // Stage 4D operator hints
//   readonly memoryHints?: readonly string[]         // Phase 2 memory context
//   readonly userPreferences?: Record<string, unknown>
//   readonly operatorDecision?: string
//   readonly conversationState?: Record<string, unknown>
//   readonly resourceBudget?: { maxTokens?: number; maxCostUsd?: number }
//
// Keep this interface empty in v1. Populating it later is additive.
export interface MatchContext {
  readonly _reserved?: never
}

export interface Matcher {
  readonly id: MatcherId
  match(request: RoutingRequest, context?: MatchContext): MatchResult

  // Reserved for Stage 5 adaptive matchers. Not implemented in v1.
  // metrics?(): MatcherMetrics
}
