// Re-exports from dependencies
export type { CapabilityId, ProviderId, CapabilityMultiplicity } from '@rohinik-org/capability-ir'
export type {
  CapabilityRequirementId,
  CapabilityRequirementSetId,
  CapabilityRequirementHash,
  CapabilityRequirementSetHash,
  ContentHash,
  IsoTimestamp,
  JsonValue,
  CapabilityRequirementSet,
} from '@rohinik-org/capability-contracts-ir'

import type { CapabilityId, ProviderId, CapabilityMultiplicity } from '@rohinik-org/capability-ir'
import type {
  CapabilityRequirementId,
  CapabilityRequirementSetId,
  CapabilityRequirementHash,
  CapabilityRequirementSetHash,
  ContentHash,
  IsoTimestamp,
  JsonValue,
  CapabilityRequirementSet,
} from '@rohinik-org/capability-contracts-ir'

// --- Branded ID types ---

export type CapabilityBindingId =
  string & { readonly __brand: 'CapabilityBindingId' }

export type CapabilityBindingHash =
  string & { readonly __brand: 'CapabilityBindingHash' }

export type ProviderResolutionId =
  string & { readonly __brand: 'ProviderResolutionId' }

export type CapabilityLockEntryHash =
  string & { readonly __brand: 'CapabilityLockEntryHash' }

// --- Constructors ---

export function toCapabilityBindingId(raw: string): CapabilityBindingId {
  if (raw.trim().length === 0) throw new Error('CapabilityBindingId must not be empty or whitespace')
  return raw as CapabilityBindingId
}

export function toProviderResolutionId(raw: string): ProviderResolutionId {
  if (raw.trim().length === 0) throw new Error('ProviderResolutionId must not be empty or whitespace')
  return raw as ProviderResolutionId
}

export function toCapabilityLockEntryHash(raw: string): CapabilityLockEntryHash {
  if (!/^[a-f0-9]{64}$/.test(raw)) throw new Error('CapabilityLockEntryHash must be a 64-char lowercase hex string')
  return raw as CapabilityLockEntryHash
}

// --- Artifact projections (§8) ---

export interface ResolvedProviderProjection {
  readonly providerId:              ProviderId
  readonly providerVersion:         string
  readonly capabilityVersion:       string
  readonly providerDescriptorHash:  ContentHash
  readonly packageId:               string
  readonly packageVersion:          string
  readonly packageContentHash:      ContentHash
}

export interface ProviderResolutionArtifactProjection {
  readonly resolutionId:        ProviderResolutionId
  readonly requirementId:       CapabilityRequirementId
  readonly requirementHash:     CapabilityRequirementHash
  readonly capabilityId:        CapabilityId
  readonly multiplicity:        CapabilityMultiplicity
  readonly selectedProviders:   readonly ResolvedProviderProjection[]
  readonly resolutionEntryHash: ContentHash
}

export interface CapabilityLockEntryProjection {
  readonly requirementId:      CapabilityRequirementId
  readonly providerId:         ProviderId
  readonly packageId:          string
  readonly packageVersion:     string
  readonly packageContentHash: ContentHash
  readonly lockEntryHash:      CapabilityLockEntryHash
}

export interface CapabilityLockArtifactProjection {
  readonly lockfileHash: ContentHash
  readonly entries:      readonly CapabilityLockEntryProjection[]
}

export interface CapabilityTrustDecisionProjection {
  readonly providerId:             ProviderId
  readonly providerDescriptorHash: ContentHash
  readonly packageContentHash:     ContentHash
  readonly decision:               'trusted' | 'denied'
  readonly trustDecisionHash:      ContentHash
}

export interface CapabilityTrustArtifactProjection {
  readonly trustArtifactHash: ContentHash
  readonly decisions:         readonly CapabilityTrustDecisionProjection[]
}

// --- Resolved provider reference (§9) ---

export interface ResolvedProviderReference {
  readonly providerId:             ProviderId
  readonly providerVersion:        string
  readonly capabilityId:           CapabilityId
  readonly capabilityVersion:      string
  readonly providerDescriptorHash: ContentHash
  readonly resolutionId:           ProviderResolutionId
  readonly resolutionEntryHash:    ContentHash

  readonly package: {
    readonly packageId:          string
    readonly packageVersion:     string
    readonly packageFormat:      'rpk'
    readonly packageContentHash: ContentHash
    readonly installationId?:    string
    readonly installationPath?:  string
  }

  readonly lockEntryHash?:     CapabilityLockEntryHash
  readonly trustDecisionHash?: ContentHash
}

// --- Binding draft (§10) ---

export interface CapabilityBindingDraft {
  readonly bindingId?:      string
  readonly setId:           CapabilityRequirementSetId
  readonly semanticHash:    CapabilityRequirementSetHash
  readonly requirementId:   CapabilityRequirementId
  readonly requirementHash: CapabilityRequirementHash
  readonly capabilityId:    CapabilityId
  readonly multiplicity:    CapabilityMultiplicity
  readonly providers:       readonly ResolvedProviderReference[]
  readonly resolutionId:    ProviderResolutionId
}

// --- Binding states (§12) ---

export type CapabilityBindingState =
  | 'planned'
  | 'installed'
  | 'ready-for-activation'
  | 'active'
  | 'invalidated'
  | 'superseded'

// --- Canonical binding types (§11) ---

export interface BoundProviderReference {
  readonly providerId:             ProviderId
  readonly providerVersion:        string
  readonly capabilityVersion:      string
  readonly packageId:              string
  readonly packageVersion:         string
  readonly packageContentHash:     ContentHash
  readonly providerDescriptorHash: ContentHash
  readonly resolutionEntryHash:    ContentHash
  readonly installationId?:        string
  readonly lockEntryHash?:         CapabilityLockEntryHash
  readonly trustDecisionHash?:     ContentHash
}

export interface CapabilityBinding {
  readonly bindingId:     CapabilityBindingId
  readonly bindingHash:   CapabilityBindingHash
  readonly schemaVersion: '1.0'

  readonly setId:           CapabilityRequirementSetId
  readonly semanticHash:    CapabilityRequirementSetHash

  readonly requirementId:   CapabilityRequirementId
  readonly requirementHash: CapabilityRequirementHash
  readonly capabilityId:    CapabilityId

  readonly multiplicity: CapabilityMultiplicity

  readonly providers: readonly BoundProviderReference[]

  readonly resolutionId: ProviderResolutionId

  readonly state:     CapabilityBindingState
  readonly createdAt: IsoTimestamp

  readonly supersedesBindingId?: CapabilityBindingId
}

// --- Binding readiness (§13) ---

export type CapabilityBindingPrerequisite =
  | 'provider-installation'
  | 'lock-entry'
  | 'trust-decision'
  | 'resolution-integrity'
  | 'requirement-integrity'

export interface CapabilityBindingReadiness {
  readonly ready:   boolean
  readonly missing: readonly CapabilityBindingPrerequisite[]
}

// --- Error and warning codes (§17-18) ---

export const CapabilityBindingErrorCode = {
  REQUIREMENT_SET_NOT_FOUND:            'REQUIREMENT_SET_NOT_FOUND',
  SEMANTIC_HASH_MISMATCH:               'SEMANTIC_HASH_MISMATCH',
  REQUIREMENT_NOT_FOUND:                'REQUIREMENT_NOT_FOUND',
  REQUIREMENT_HASH_MISMATCH:            'REQUIREMENT_HASH_MISMATCH',
  CAPABILITY_ID_MISMATCH:               'CAPABILITY_ID_MISMATCH',
  MULTIPLICITY_MISMATCH:                'MULTIPLICITY_MISMATCH',
  RESOLUTION_ID_MISMATCH:               'RESOLUTION_ID_MISMATCH',
  RESOLUTION_ENTRY_MISMATCH:            'RESOLUTION_ENTRY_MISMATCH',
  PROVIDER_NOT_IN_RESOLUTION:           'PROVIDER_NOT_IN_RESOLUTION',
  PROVIDER_ORDER_MISMATCH:              'PROVIDER_ORDER_MISMATCH',
  SINGLE_REQUIRES_EXACTLY_ONE_PROVIDER: 'SINGLE_REQUIRES_EXACTLY_ONE_PROVIDER',
  ONE_OR_MORE_REQUIRES_PROVIDER:        'ONE_OR_MORE_REQUIRES_PROVIDER',
  ALL_COMPATIBLE_PROVIDER_SET_MISMATCH: 'ALL_COMPATIBLE_PROVIDER_SET_MISMATCH',
  DUPLICATE_PROVIDER_ID:                'DUPLICATE_PROVIDER_ID',
  PACKAGE_CONTENT_HASH_MISMATCH:        'PACKAGE_CONTENT_HASH_MISMATCH',
  INSTALLATION_REFERENCE_MISSING:       'INSTALLATION_REFERENCE_MISSING',
  LOCK_ENTRY_MISMATCH:                  'LOCK_ENTRY_MISMATCH',
  TRUST_DECISION_MISMATCH:              'TRUST_DECISION_MISMATCH',
  BINDING_ALREADY_SUPERSEDED:           'BINDING_ALREADY_SUPERSEDED',
  INVALID_BINDING_STATE_TRANSITION:     'INVALID_BINDING_STATE_TRANSITION',
} as const

export type CapabilityBindingErrorCode =
  typeof CapabilityBindingErrorCode[keyof typeof CapabilityBindingErrorCode]

export interface CapabilityBindingValidationError {
  readonly code:          CapabilityBindingErrorCode
  readonly path:          string
  readonly relatedPaths?: readonly string[]
  readonly message:       string
  readonly details?:      Readonly<Record<string, JsonValue>>
}

export interface CapabilityBindingValidationWarning {
  readonly code:
    | 'LOCK_ARTIFACT_NOT_YET_AVAILABLE'
    | 'TRUST_ARTIFACT_NOT_YET_AVAILABLE'
    | 'PROVIDER_NOT_YET_INSTALLED'
  readonly path:    string
  readonly message: string
}

export interface CapabilityBindingValidationResult {
  readonly valid:    boolean
  readonly errors:   readonly CapabilityBindingValidationError[]
  readonly warnings: readonly CapabilityBindingValidationWarning[]
}

// --- Build results (§15) ---

export type CapabilityBindingBuildResult =
  | {
      readonly status:     'created'
      readonly binding:    CapabilityBinding
      readonly validation: CapabilityBindingValidationResult
    }
  | {
      readonly status:     'invalid'
      readonly validation: CapabilityBindingValidationResult
    }

export interface CapabilityBindingSupersessionResult {
  readonly previous:    CapabilityBinding
  readonly replacement: CapabilityBinding
}

// --- Binding hash projection (§19) ---

export interface CapabilityBindingHashProjection {
  readonly schemaVersion:   '1.0'
  readonly setId:           CapabilityRequirementSetId
  readonly semanticHash:    CapabilityRequirementSetHash
  readonly requirementId:   CapabilityRequirementId
  readonly requirementHash: CapabilityRequirementHash
  readonly capabilityId:    CapabilityId
  readonly multiplicity:    CapabilityMultiplicity
  readonly providers: readonly {
    readonly providerId:             ProviderId
    readonly providerVersion:        string
    readonly capabilityVersion:      string
    readonly packageId:              string
    readonly packageVersion:         string
    readonly packageContentHash:     ContentHash
    readonly providerDescriptorHash: ContentHash
    readonly resolutionEntryHash:    ContentHash
    readonly installationId?:        string
    readonly lockEntryHash?:         CapabilityLockEntryHash
    readonly trustDecisionHash?:     ContentHash
  }[]
  readonly resolutionId:         ProviderResolutionId
  readonly state:                Exclude<CapabilityBindingState, 'active'>
  readonly supersedesBindingId?: CapabilityBindingId
}

// --- Capability handle reference (§20) ---

export interface CapabilityHandleReference {
  readonly capabilityId:  CapabilityId
  readonly requirementId: CapabilityRequirementId
  readonly bindingId:     CapabilityBindingId
  readonly bindingHash:   CapabilityBindingHash
  readonly providerIds:   readonly ProviderId[]
}

// --- Binding repository interface (§21) ---

export type CapabilityBindingPutResult =
  | { readonly status: 'accepted';                readonly binding:   CapabilityBinding }
  | { readonly status: 'already-exists-identical'; readonly binding:  CapabilityBinding }
  | { readonly status: 'collision';               readonly bindingId: CapabilityBindingId }

export interface CapabilityBindingRepository {
  put(binding: CapabilityBinding): Promise<CapabilityBindingPutResult>
  get(bindingId: CapabilityBindingId): Promise<CapabilityBinding | undefined>
  getCurrentForRequirement(requirementId: CapabilityRequirementId): Promise<CapabilityBinding | undefined>
  listForSet(setId: CapabilityRequirementSetId): Promise<readonly CapabilityBinding[]>
  invalidate(bindingId: CapabilityBindingId, reason: CapabilityBindingInvalidationReason): Promise<CapabilityBinding>
}

// --- Invalidation types (§23) ---

export interface CapabilityBindingInvalidationReason {
  readonly code:
    | 'REQUIREMENT_CHANGED'
    | 'RESOLUTION_REVOKED'
    | 'PACKAGE_INTEGRITY_FAILURE'
    | 'LOCKFILE_MISMATCH'
    | 'TRUST_REVOKED'
    | 'INSTALLATION_MISSING'
    | 'PROVIDER_DESCRIPTOR_CHANGED'
  readonly message:    string
  readonly detectedAt: IsoTimestamp
}

// --- Builder interface (§14) ---

export interface CapabilityBindingBuildContext {
  readonly requirementSet:     CapabilityRequirementSet
  readonly resolutionArtifact: ProviderResolutionArtifactProjection
  readonly lockArtifact?:      CapabilityLockArtifactProjection
  readonly trustArtifact?:     CapabilityTrustArtifactProjection
}

export interface CapabilityBindingBuilder {
  build(
    draft:   CapabilityBindingDraft,
    context: CapabilityBindingBuildContext,
  ): CapabilityBindingBuildResult

  supersede(
    existing:         CapabilityBinding,
    replacementDraft: CapabilityBindingDraft,
    context:          CapabilityBindingBuildContext,
  ): CapabilityBindingSupersessionResult
}
