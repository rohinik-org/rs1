// @rohinik-org/capability-contracts-ir
// Stage 9E-2 — Capability Consumption Contracts IR
// Zero runtime dependencies. Imports capability-ir for shared cross-boundary IDs.

export type { CapabilityId, ApplicationId, ProviderId } from '@rohinik-org/capability-ir'
export { CAPABILITY_ID_PATTERN } from '@rohinik-org/capability-ir'

import type { CapabilityId, ApplicationId, ProviderId } from '@rohinik-org/capability-ir'

// ──────────────────────────────────────────────────────────────────────────────
// §6 — IsoTimestamp, IdGenerator, Clock
// ──────────────────────────────────────────────────────────────────────────────

export type IsoTimestamp = string & { readonly __brand: 'IsoTimestamp' }

export interface IdGenerator {
  generate(): string
}

export interface Clock {
  now(): IsoTimestamp
}

// ──────────────────────────────────────────────────────────────────────────────
// §4 — Additional branded IDs (consumer-layer; constructors exposed here)
//       CapabilityRequirementHash / CapabilityRequirementSetHash have no public
//       constructors — those live in capability-contracts internals only.
// ──────────────────────────────────────────────────────────────────────────────

export type CapabilityRequirementId      = string & { readonly __brand: 'CapabilityRequirementId' }
export type CapabilityRequirementSetId   = string & { readonly __brand: 'CapabilityRequirementSetId' }
export type CapabilityRequirementHash    = string & { readonly __brand: 'CapabilityRequirementHash' }
export type CapabilityRequirementSetHash = string & { readonly __brand: 'CapabilityRequirementSetHash' }
export type ContentHash                  = string & { readonly __brand: 'ContentHash' }

/** Not in execution-ir — defined here for this stage. */
export type OperationId = string & { readonly __brand: 'OperationId' }

export function toCapabilityRequirementId(raw: string): CapabilityRequirementId {
  if (!raw.trim()) throw new Error(`Invalid CapabilityRequirementId: '${raw}'`)
  return raw as CapabilityRequirementId
}

export function toCapabilityRequirementSetId(raw: string): CapabilityRequirementSetId {
  if (!raw.trim()) throw new Error(`Invalid CapabilityRequirementSetId: '${raw}'`)
  return raw as CapabilityRequirementSetId
}

const CONTENT_HASH_PATTERN = /^[a-f0-9]{64}$/

export function toContentHash(raw: string): ContentHash {
  if (!CONTENT_HASH_PATTERN.test(raw)) {
    throw new Error(`Invalid ContentHash — must be 64-character lowercase hex: '${raw}'`)
  }
  return raw as ContentHash
}

// ──────────────────────────────────────────────────────────────────────────────
// §7 — JsonValue and canonical serializer error types
//      (implementations live in capability-contracts)
// ──────────────────────────────────────────────────────────────────────────────

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue }

export class CanonicalSerializerError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CanonicalSerializerError'
  }
}

export class CanonicalParserError extends Error {
  readonly code: 'DUPLICATE_OBJECT_KEY' | 'INVALID_NUMBER' | 'PARSE_FAILURE'
  constructor(code: 'DUPLICATE_OBJECT_KEY' | 'INVALID_NUMBER' | 'PARSE_FAILURE', message: string) {
    super(message)
    this.code = code
    this.name = 'CanonicalParserError'
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// §8 — VersionRange
// ──────────────────────────────────────────────────────────────────────────────

export type VersionRangeExpression = string & { readonly __brand: 'VersionRangeExpression' }

export interface VersionRange {
  readonly expression: string               // as authored
  readonly normalized: VersionRangeExpression // canonical semver form
}

// parseVersionRange lives in capability-contracts (has semver dep)

// ──────────────────────────────────────────────────────────────────────────────
// §9 — Capability Constraints
// ──────────────────────────────────────────────────────────────────────────────

// §9.2
export type RuntimeLanguage =
  | 'nodejs'
  | 'python'
  | 'wasm'
  | (string & { readonly __customRuntimeLanguage?: never })

export interface RuntimeConstraint {
  readonly kind: 'runtime'
  readonly language: RuntimeLanguage
  readonly minVersion?: string
  readonly hardness: 'hard' | 'soft'
}

export interface PlatformConstraint {
  readonly kind: 'platform'
  readonly os?: 'linux' | 'darwin' | 'win32'
  readonly arch?: 'x64' | 'arm64'
  readonly hardness: 'hard' | 'soft'
}

// §9.3 — always hard, no hardness field
export interface DataResidencyConstraint {
  readonly kind: 'data-residency'
  readonly allowedRegions: readonly string[]
}

// §9.4
export interface ExecutionLocationConstraint {
  readonly kind: 'execution-location'
  readonly mode: 'local-only' | 'local-preferred' | 'remote-allowed' | 'remote-required'
  readonly hardness: 'hard' | 'soft'
}

// §9.5
export type LatencyMetric =
  | 'time-to-first-result'
  | 'total-response'
  | 'provider-execution'

export interface LatencyConstraint {
  readonly kind: 'latency'
  readonly metric: LatencyMetric
  readonly maximumMs: number
  readonly percentile: 50 | 90 | 95 | 99
  readonly hardness: 'hard' | 'soft'
}

// §9.6
export interface MoneyAmount {
  readonly currency: 'USD'
  readonly micros: string // /^(0|[1-9][0-9]*)$/
}

export interface CostConstraint {
  readonly kind: 'cost'
  readonly maximumPerCall?: MoneyAmount
  readonly maximumPerMillionInputTokens?: MoneyAmount
  readonly maximumPerMillionOutputTokens?: MoneyAmount
  readonly hardness: 'hard' | 'soft'
}

// §9.7
export interface ContextCapacityConstraint {
  readonly kind: 'context-capacity'
  readonly minimumContextTokens?: number
  readonly minimumOutputTokens?: number
  readonly hardness: 'hard' | 'soft'
}

// §9.8 — always hard, no hardness field
export interface PrivacyConstraint {
  readonly kind: 'privacy'
  readonly requiresOnPremise?: boolean
  readonly forbidsExternalTransmission?: boolean
}

// §9.9 — always hard, no hardness field
export interface PermissionConstraint {
  readonly kind: 'permission'
  readonly required: readonly string[]
  readonly forbidden: readonly string[]
}

// §9.10
export type TrustLevel = 'official' | 'verified' | 'signed' | 'unsigned' | 'unknown'

export const TRUST_LEVEL_RANK: readonly TrustLevel[] = [
  'unknown',
  'unsigned',
  'signed',
  'verified',
  'official',
] as const

export interface TrustConstraint {
  readonly kind: 'trust'
  readonly minimum: TrustLevel
  readonly hardness: 'hard' | 'soft'
}

// §9.11
export interface FeatureConstraint {
  readonly kind: 'feature'
  readonly requiredFeatures: readonly string[]
  readonly forbiddenFeatures: readonly string[]
  readonly hardness: 'hard' | 'soft'
}

// §11 — ProviderOverrideConstraint (top-level field on CapabilityRequirement, NOT in union)
export interface ProviderOverrideConstraint {
  readonly kind: 'provider-override'
  readonly providerId: ProviderId
  readonly reason: string
  readonly hardness: 'hard'
}

// CapabilityConstraint union — ProviderOverrideConstraint is NOT here (§11)
export type CapabilityConstraint =
  | RuntimeConstraint
  | PlatformConstraint
  | DataResidencyConstraint
  | ExecutionLocationConstraint
  | LatencyConstraint
  | CostConstraint
  | ContextCapacityConstraint
  | PrivacyConstraint
  | PermissionConstraint
  | TrustConstraint
  | FeatureConstraint

/** Returns hardness of any constraint. Hard-only types have no hardness field. */
export function constraintHardness(c: CapabilityConstraint): 'hard' | 'soft' {
  switch (c.kind) {
    case 'data-residency':
    case 'privacy':
    case 'permission':
      return 'hard'
    default:
      return c.hardness
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// §10 — Capability Preferences
// ──────────────────────────────────────────────────────────────────────────────

export interface ExecutionLocationPreference {
  readonly kind: 'execution-location'
  readonly preferred: 'local' | 'remote'
  readonly weight: number
}

export interface LatencyPreference {
  readonly kind: 'latency'
  readonly preferred: 'low' | 'medium'
  readonly weight: number
}

export interface CostPreference {
  readonly kind: 'cost'
  readonly preferred: 'lowest' | 'balanced'
  readonly weight: number
}

export interface TrustLevelPreference {
  readonly kind: 'trust-level'
  readonly preferred: TrustLevel
  readonly weight: number
}

export interface ProviderPreference {
  readonly kind: 'provider-preference'
  readonly preferredProviderIds: readonly ProviderId[]
  readonly weight: number
}

export type CapabilityPreference =
  | ExecutionLocationPreference
  | LatencyPreference
  | CostPreference
  | TrustLevelPreference
  | ProviderPreference

// ──────────────────────────────────────────────────────────────────────────────
// §12 — Fallback Policy
// ──────────────────────────────────────────────────────────────────────────────

export interface AlternativeCapabilityFallback {
  readonly kind: 'use-alternative'
  readonly alternative: {
    readonly capabilityId: CapabilityId
    readonly versionRange: VersionRange
  }
}

export interface StubFallback {
  readonly kind: 'use-stub'
  readonly stubId: string
  readonly behaviorContractHash: ContentHash
}

export interface FailFastFallback {
  readonly kind: 'fail-fast'
}

export type CapabilityFallbackPolicy =
  | AlternativeCapabilityFallback
  | StubFallback
  | FailFastFallback

// ──────────────────────────────────────────────────────────────────────────────
// §13 — Degradation Policy
// ──────────────────────────────────────────────────────────────────────────────

export type CapabilityDegradationPolicy =
  | { readonly kind: 'allow-degraded' }
  | { readonly kind: 'reject-degraded' }
  | { readonly kind: 'escalate'; readonly escalationCapabilityId: CapabilityId }

// ──────────────────────────────────────────────────────────────────────────────
// §14 — Requirement Origin
// ──────────────────────────────────────────────────────────────────────────────

export type RequirementOriginEntry =
  | { readonly kind: 'application'; readonly applicationId: ApplicationId }
  | { readonly kind: 'subsystem';   readonly subsystemName: string }
  | { readonly kind: 'package';     readonly packageId: string; readonly packageVersion: string }
  | { readonly kind: 'operation';   readonly operationId: OperationId }
  | { readonly kind: 'policy';      readonly policyId: string; readonly policyVersion: string }

export interface RequirementOrigin {
  readonly direct: RequirementOriginEntry
  readonly chain: readonly RequirementOriginEntry[]
}

export function originIdentityKey(entry: RequirementOriginEntry): string {
  switch (entry.kind) {
    case 'application': return `application:${entry.applicationId}`
    case 'subsystem':   return `subsystem:${entry.subsystemName}`
    case 'package':     return `package:${entry.packageId}@${entry.packageVersion}`
    case 'operation':   return `operation:${entry.operationId}`
    case 'policy':      return `policy:${entry.policyId}@${entry.policyVersion}`
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// §15 — Hash Projections (type-safety / documentation; hashing in capability-contracts)
// ──────────────────────────────────────────────────────────────────────────────

export interface RequirementHashProjection {
  readonly capabilityId:       CapabilityId
  readonly versionRange:       VersionRangeExpression
  readonly necessity:          'required' | 'optional'
  readonly multiplicity:       'single' | 'one-or-more' | 'all-compatible'
  readonly constraints:        readonly CapabilityConstraint[]
  readonly preferences:        readonly CapabilityPreference[]
  readonly providerOverride?:  ProviderOverrideConstraint
  readonly fallbackPolicy?:    RequirementHashFallbackPolicy
  readonly degradationPolicy?: CapabilityDegradationPolicy
  readonly requestedBy:        RequirementOrigin
}

export type RequirementHashFallbackPolicy =
  | {
      readonly kind: 'use-alternative'
      readonly alternative: {
        readonly capabilityId: CapabilityId
        readonly versionRange: VersionRangeExpression
      }
    }
  | { readonly kind: 'use-stub'; readonly stubId: string; readonly behaviorContractHash: ContentHash }
  | { readonly kind: 'fail-fast' }

export interface RequirementSetHashProjection {
  readonly schemaVersion:     '1.0'
  readonly applicationId?:    ApplicationId
  readonly operationId?:      OperationId
  readonly requirementHashes: readonly CapabilityRequirementHash[]
}

// ──────────────────────────────────────────────────────────────────────────────
// §16 — CapabilityRequirement
// ──────────────────────────────────────────────────────────────────────────────

export interface CapabilityRequirement {
  readonly requirementId:      CapabilityRequirementId
  readonly requirementHash:    CapabilityRequirementHash
  readonly capabilityId:       CapabilityId
  readonly versionRange:       VersionRange
  readonly necessity:          'required' | 'optional'
  readonly multiplicity:       'single' | 'one-or-more' | 'all-compatible'
  readonly constraints:        readonly CapabilityConstraint[]
  readonly preferences:        readonly CapabilityPreference[]
  readonly providerOverride?:  ProviderOverrideConstraint
  readonly fallbackPolicy?:    CapabilityFallbackPolicy
  readonly degradationPolicy?: CapabilityDegradationPolicy
  readonly requestedBy:        RequirementOrigin
}

// ──────────────────────────────────────────────────────────────────────────────
// §17 — CapabilityRequirementSet
// ──────────────────────────────────────────────────────────────────────────────

export interface CapabilityRequirementSet {
  readonly setId:         CapabilityRequirementSetId
  readonly semanticHash:  CapabilityRequirementSetHash
  readonly schemaVersion: '1.0'
  readonly applicationId?: ApplicationId
  readonly operationId?:   OperationId
  readonly requirements:  readonly CapabilityRequirement[]
  readonly createdAt:     IsoTimestamp
}

// ──────────────────────────────────────────────────────────────────────────────
// §18 — Draft Types
// ──────────────────────────────────────────────────────────────────────────────

export type DraftNecessity    = 'required' | 'optional'
export type DraftMultiplicity = 'single' | 'one-or-more' | 'all-compatible'

export interface CapabilityRequirementDraft {
  requirementId?:    string
  capabilityId:      string
  versionRange:      string
  necessity?:        DraftNecessity
  multiplicity?:     DraftMultiplicity
  constraints?:      unknown[]
  preferences?:      unknown[]
  providerOverride?: unknown
  fallbackPolicy?:   unknown
  degradationPolicy?: unknown
  requestedBy:       unknown
}

export interface CapabilityRequirementSetDraft {
  setId?:        string
  applicationId?: string
  operationId?:  string
  requirements:  readonly CapabilityRequirementDraft[]
}

// ──────────────────────────────────────────────────────────────────────────────
// §18.1 — PreparedRequirementSet opaque token + error hierarchy
// ──────────────────────────────────────────────────────────────────────────────

declare const PreparedRequirementSetBrand: unique symbol
export type PreparedRequirementSet = Readonly<{
  readonly [PreparedRequirementSetBrand]: 'PreparedRequirementSet'
}>

export class PreparedRequirementSetError extends Error {
  readonly code: 'PREPARED_SET_ALREADY_CONSUMED' | 'PREPARED_SET_FOREIGN_BUILDER' | 'INVALID_PREPARED_SET'
  constructor(code: PreparedRequirementSetError['code'], message: string) {
    super(message)
    this.code = code
    this.name = 'PreparedRequirementSetError'
  }
}

export class PreparedSetAlreadyConsumedError extends PreparedRequirementSetError {
  declare readonly code: 'PREPARED_SET_ALREADY_CONSUMED'
  constructor(message: string) {
    super('PREPARED_SET_ALREADY_CONSUMED', message)
    this.name = 'PreparedSetAlreadyConsumedError'
  }
}

export class ForeignPreparedSetError extends PreparedRequirementSetError {
  declare readonly code: 'PREPARED_SET_FOREIGN_BUILDER'
  constructor(message: string) {
    super('PREPARED_SET_FOREIGN_BUILDER', message)
    this.name = 'ForeignPreparedSetError'
  }
}

export class InvalidPreparedSetError extends PreparedRequirementSetError {
  declare readonly code: 'INVALID_PREPARED_SET'
  constructor(message: string) {
    super('INVALID_PREPARED_SET', message)
    this.name = 'InvalidPreparedSetError'
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// §18.1 — Builder result types and interfaces
// ──────────────────────────────────────────────────────────────────────────────

export type CapabilityRequirementPreparationResult =
  | {
      readonly status:         'ok'
      readonly semanticHash:   CapabilityRequirementSetHash
      readonly suppliedSetId?: CapabilityRequirementSetId
      readonly prepared:       PreparedRequirementSet
      readonly validation:     RequirementValidationResult
    }
  | {
      readonly status:     'invalid'
      readonly validation: RequirementValidationResult
    }

export interface CapabilityRequirementMaterializationResult {
  readonly interned: InternedCapabilityRequirementSet
}

export interface InternedCapabilityRequirementSet {
  readonly set: CapabilityRequirementSet
  readonly envelopeIdentity: {
    readonly setId:        CapabilityRequirementSetId
    readonly createdAt:    IsoTimestamp
    readonly semanticHash: CapabilityRequirementSetHash
  }
}

export interface CapabilityRequirementBuilder {
  prepare(draft: CapabilityRequirementSetDraft): CapabilityRequirementPreparationResult
  materialize(
    prepared: PreparedRequirementSet,
    envelope?: { readonly setId?: CapabilityRequirementSetId },
  ): CapabilityRequirementMaterializationResult
}

// ──────────────────────────────────────────────────────────────────────────────
// §21 — Availability and Resolution Outcome Types
// ──────────────────────────────────────────────────────────────────────────────

export type CapabilityAvailabilityState =
  | 'absent'
  | 'no-compatible-provider'
  | 'constraint-violated'
  | 'provider-unavailable'
  | 'configuration-required'
  | 'ready'

export type CapabilityRequirementResolutionState =
  | 'resolved'
  | 'unresolved-required'
  | 'unresolved-optional'

/** Pure function. 'ready' + any → 'resolved'. non-ready + optional → 'unresolved-optional'. non-ready + required → 'unresolved-required'. */
export function deriveResolutionState(
  availability: CapabilityAvailabilityState,
  necessity: 'required' | 'optional',
): CapabilityRequirementResolutionState {
  if (availability === 'ready') return 'resolved'
  return necessity === 'optional' ? 'unresolved-optional' : 'unresolved-required'
}

export interface CapabilityRequirementStatus {
  readonly requirementId: CapabilityRequirementId
  readonly necessity:     'required' | 'optional'
  readonly availability:  CapabilityAvailabilityState
  readonly resolution:    CapabilityRequirementResolutionState
  readonly reasonCode?:   string
  readonly checkedAt:     IsoTimestamp
}

export interface CapabilityAvailabilityReport {
  readonly setId:   CapabilityRequirementSetId
  readonly entries: readonly CapabilityRequirementStatus[]
}

// ──────────────────────────────────────────────────────────────────────────────
// §22 — Error and Warning Code Constants
// ──────────────────────────────────────────────────────────────────────────────

export const RequirementValidationErrorCode = {
  INVALID_CAPABILITY_ID:            'INVALID_CAPABILITY_ID',
  UNPARSEABLE_VERSION_RANGE:        'UNPARSEABLE_VERSION_RANGE',
  DUPLICATE_REQUIREMENT_ID:         'DUPLICATE_REQUIREMENT_ID',
  CONTRADICTORY_CONSTRAINTS:        'CONTRADICTORY_CONSTRAINTS',
  CONTRADICTORY_PREFERENCES:        'CONTRADICTORY_PREFERENCES',
  DUPLICATE_PREFERENCE_KIND:        'DUPLICATE_PREFERENCE_KIND',
  INVALID_MULTIPLICITY:             'INVALID_MULTIPLICITY',
  FALLBACK_SELF_REFERENCE:          'FALLBACK_SELF_REFERENCE',
  PROVIDER_OVERRIDE_MISSING_REASON: 'PROVIDER_OVERRIDE_MISSING_REASON',
  INVALID_ORIGIN_CHAIN:             'INVALID_ORIGIN_CHAIN',
  ORIGIN_IDENTITY_REPEATED:         'ORIGIN_IDENTITY_REPEATED',
  EMPTY_ORIGIN_IDENTIFIER:          'EMPTY_ORIGIN_IDENTIFIER',
  INVALID_MONEY_MICROS:             'INVALID_MONEY_MICROS',
  NEGATIVE_LATENCY:                 'NEGATIVE_LATENCY',
  NEGATIVE_CAPACITY:                'NEGATIVE_CAPACITY',
  MISSING_LATENCY_PERCENTILE:       'MISSING_LATENCY_PERCENTILE',
  INVALID_WEIGHT:                   'INVALID_WEIGHT',
  UNKNOWN_FIELD:                    'UNKNOWN_FIELD',
  NON_INTEGER_NUMERIC_FIELD:        'NON_INTEGER_NUMERIC_FIELD',
  NUMERIC_FIELD_OUT_OF_RANGE:       'NUMERIC_FIELD_OUT_OF_RANGE',
  INVALID_RUNTIME_LANGUAGE:         'INVALID_RUNTIME_LANGUAGE',
  INVALID_CONTENT_HASH:             'INVALID_CONTENT_HASH',
} as const

export type RequirementValidationErrorCode =
  typeof RequirementValidationErrorCode[keyof typeof RequirementValidationErrorCode]

export const RequirementSubmissionErrorCode = {
  REQUIREMENT_SET_ID_COLLISION: 'REQUIREMENT_SET_ID_COLLISION',
} as const

export type RequirementSubmissionErrorCode =
  typeof RequirementSubmissionErrorCode[keyof typeof RequirementSubmissionErrorCode]

export const RequirementValidationWarningCode = {
  SOFT_CONSTRAINT_REDUNDANT:      'SOFT_CONSTRAINT_REDUNDANT',
  NO_PREFERENCES:                 'NO_PREFERENCES',
  ORIGIN_CHAIN_DEPTH:             'ORIGIN_CHAIN_DEPTH',
  DEGRADATION_THRESHOLD_DEFERRED: 'DEGRADATION_THRESHOLD_DEFERRED',
} as const

export type RequirementValidationWarningCode =
  typeof RequirementValidationWarningCode[keyof typeof RequirementValidationWarningCode]

// ──────────────────────────────────────────────────────────────────────────────
// §23 — Validation Result Types
// ──────────────────────────────────────────────────────────────────────────────

export interface RequirementValidationError {
  readonly code:           RequirementValidationErrorCode
  readonly path:           string
  readonly relatedPaths?:  readonly string[]
  readonly requirementId?: CapabilityRequirementId
  readonly message:        string
  readonly details?:       Readonly<Record<string, unknown>>
}

export interface RequirementValidationWarning {
  readonly code:           RequirementValidationWarningCode
  readonly path:           string
  readonly requirementId?: CapabilityRequirementId
  readonly message:        string
}

export interface RequirementValidationResult {
  readonly valid:    boolean
  readonly errors:   readonly RequirementValidationError[]
  readonly warnings: readonly RequirementValidationWarning[]
}

// ──────────────────────────────────────────────────────────────────────────────
// §25 — Service Contract Types
// ──────────────────────────────────────────────────────────────────────────────

export interface CapabilityRequirementRepository {
  submit(draft: CapabilityRequirementSetDraft): Promise<CapabilityRequirementSubmissionResult>
  get(setId: CapabilityRequirementSetId): Promise<CapabilityRequirementSet | undefined>
}

export type CapabilityRequirementSubmissionStatus =
  | 'accepted'
  | 'already-exists-identical'
  | 'rejected'

export interface CapabilityRequirementSubmissionResult {
  readonly status:           CapabilityRequirementSubmissionStatus
  readonly validation:       RequirementValidationResult
  readonly submissionErrors: readonly SubmissionError[]
  readonly setId?:           CapabilityRequirementSetId
  readonly semanticHash?:    CapabilityRequirementSetHash
}

export interface SubmissionError {
  readonly code:     RequirementSubmissionErrorCode
  readonly message:  string
  readonly details?: Readonly<Record<string, unknown>>
}
