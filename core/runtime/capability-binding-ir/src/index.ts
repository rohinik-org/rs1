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

export interface CapabilityInstallationEntryProjection {
  readonly providerId:              ProviderId
  readonly packageId:               string
  readonly packageVersion:          string
  readonly packageContentHash:      ContentHash
  readonly installationId:          string
  readonly installationPath:        string
  readonly installationEntryHash:   ContentHash
}

export interface CapabilityInstallationArtifactProjection {
  readonly installationArtifactHash: ContentHash
  readonly installations:            readonly CapabilityInstallationEntryProjection[]
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
// lockEntryHash, trustDecisionHash, installationId, installationPath are NOT here.
// They come exclusively from authoritative Stage 9H-2, 9I-2, 9J-2 projections.

export interface ResolvedProviderReference {
  readonly providerId:             ProviderId
  readonly providerVersion:        string
  readonly capabilityId:           CapabilityId
  readonly capabilityVersion:      string
  readonly providerDescriptorHash: ContentHash
  readonly resolutionId:           ProviderResolutionId

  readonly package: {
    readonly packageId:          string
    readonly packageVersion:     string
    readonly packageFormat:      'rpk'
    readonly packageContentHash: ContentHash
  }
}

// --- Binding draft (§10) ---
// No bindingId or supersedesBindingId — assigned by materialize()

export interface CapabilityBindingDraft {
  readonly setId:           CapabilityRequirementSetId
  readonly semanticHash:    CapabilityRequirementSetHash
  readonly requirementId:   CapabilityRequirementId
  readonly requirementHash: CapabilityRequirementHash
  readonly capabilityId:    CapabilityId
  readonly multiplicity:    CapabilityMultiplicity
  readonly providers:       readonly ResolvedProviderReference[]
  readonly resolutionId:    ProviderResolutionId
}

// --- Binding states (§13) ---

export type CapabilityBindingState =
  | 'planned'
  | 'installed'
  | 'ready-for-activation'
  | 'active'
  | 'invalidated'
  | 'superseded'

// --- Bound provider reference (§11) ---
// installationId/installationPath live on CapabilityProviderInstallationState, not here.

export interface BoundProviderReference {
  readonly providerId:             ProviderId
  readonly providerVersion:        string
  readonly capabilityVersion:      string
  readonly packageId:              string
  readonly packageVersion:         string
  readonly packageContentHash:     ContentHash
  readonly providerDescriptorHash: ContentHash
  readonly lockEntryHash?:         CapabilityLockEntryHash
  readonly trustDecisionHash?:     ContentHash
}

// --- Canonical binding (immutable semantic identity, no state field) (§11) ---

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

  readonly resolutionId:        ProviderResolutionId
  readonly resolutionEntryHash: ContentHash

  readonly createdAt: IsoTimestamp

  readonly supersedesBindingId?: CapabilityBindingId
}

// --- Installation state (per provider, on record) ---

export interface CapabilityProviderInstallationState {
  readonly providerId:            ProviderId
  readonly installationId:        string
  readonly installationPath:      string
  readonly installationEntryHash: ContentHash
}

// --- Binding lifecycle record (§12) ---

export interface CapabilityBindingRecord {
  readonly binding:             CapabilityBinding
  readonly state:               CapabilityBindingState
  readonly stateVersion:        number
  readonly updatedAt:           IsoTimestamp
  readonly readiness:           CapabilityBindingReadiness
  readonly installations:       readonly CapabilityProviderInstallationState[]
  readonly invalidationReason?: CapabilityBindingInvalidationReason
}

// --- Binding readiness (§14) ---

export type CapabilityBindingPrerequisite =
  | 'provider-installation'
  | 'lock-entry'
  | 'trust-decision'
  | 'resolution-integrity'
  | 'requirement-integrity'

export interface CapabilityProviderReadiness {
  readonly providerId: ProviderId
  readonly ready:      boolean
  readonly missing:    readonly CapabilityBindingPrerequisite[]
}

export interface CapabilityBindingReadiness {
  readonly ready:     boolean
  readonly providers: readonly CapabilityProviderReadiness[]
}

// --- Error and warning codes (§19-20) ---

export const CapabilityBindingErrorCode = {
  REQUIREMENT_SET_ID_MISMATCH:          'REQUIREMENT_SET_ID_MISMATCH',
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
  INSTALLATION_ENTRY_MISMATCH:          'INSTALLATION_ENTRY_MISMATCH',
  INSTALLATION_REFERENCE_INVALID:       'INSTALLATION_REFERENCE_INVALID',
  LOCK_ENTRY_MISMATCH:                  'LOCK_ENTRY_MISMATCH',
  TRUST_DECISION_MISMATCH:              'TRUST_DECISION_MISMATCH',
  TRUST_DECISION_DENIED:                'TRUST_DECISION_DENIED',
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

// --- Prepared binding token (§16) ---

declare const PreparedCapabilityBindingBrand: unique symbol
export type PreparedCapabilityBinding = Readonly<{
  readonly [PreparedCapabilityBindingBrand]: 'PreparedCapabilityBinding'
}>

export type CapabilityBindingPreparationResult =
  | {
      readonly status:      'ok'
      readonly bindingHash: CapabilityBindingHash
      readonly readiness:   CapabilityBindingReadiness
      readonly state:       Exclude<CapabilityBindingState, 'active' | 'invalidated' | 'superseded'>
      readonly prepared:    PreparedCapabilityBinding
      readonly validation:  CapabilityBindingValidationResult
    }
  | {
      readonly status:     'invalid'
      readonly validation: CapabilityBindingValidationResult
    }

// --- Build results (§17) ---

export interface CapabilityBindingSupersessionResult {
  readonly previous:    CapabilityBindingRecord
  readonly replacement: CapabilityBindingRecord
}

// --- Binding hash projection (§21) ---

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
    readonly lockEntryHash?:         CapabilityLockEntryHash
    readonly trustDecisionHash?:     ContentHash
  }[]
  readonly resolutionId:        ProviderResolutionId
  readonly resolutionEntryHash: ContentHash
  readonly supersedesBindingId?: CapabilityBindingId
}

// --- Capability handle reference (§22) ---

export interface CapabilityHandleReference {
  readonly capabilityId:  CapabilityId
  readonly requirementId: CapabilityRequirementId
  readonly bindingId:     CapabilityBindingId
  readonly bindingHash:   CapabilityBindingHash
  readonly providerIds:   readonly ProviderId[]
}

// --- Binding repository interface (§23) ---

export type CapabilityBindingPutResult =
  | { readonly status: 'accepted';                readonly record:    CapabilityBindingRecord }
  | { readonly status: 'already-exists-identical'; readonly record:  CapabilityBindingRecord }
  | { readonly status: 'collision';               readonly bindingId: CapabilityBindingId }

export interface CapabilityBindingRepository {
  put(
    binding:       CapabilityBinding,
    readiness:     CapabilityBindingReadiness,
    installations: readonly CapabilityProviderInstallationState[],
  ): Promise<CapabilityBindingPutResult>

  get(bindingId: CapabilityBindingId): Promise<CapabilityBindingRecord | undefined>

  getByHash(bindingHash: CapabilityBindingHash): Promise<CapabilityBindingRecord | undefined>

  getCurrentForRequirement(requirementId: CapabilityRequirementId): Promise<CapabilityBindingRecord | undefined>

  listForSet(setId: CapabilityRequirementSetId): Promise<readonly CapabilityBindingRecord[]>

  refreshReadiness(
    bindingId:     CapabilityBindingId,
    readiness:     CapabilityBindingReadiness,
    installations: readonly CapabilityProviderInstallationState[],
    updatedAt:     IsoTimestamp,
  ): Promise<CapabilityBindingRecord>

  invalidate(
    bindingId: CapabilityBindingId,
    reason:    CapabilityBindingInvalidationReason,
    updatedAt: IsoTimestamp,
  ): Promise<CapabilityBindingRecord>

  supersede(
    existingBindingId:        CapabilityBindingId,
    replacement:              CapabilityBinding,
    replacementReadiness:     CapabilityBindingReadiness,
    replacementInstallations: readonly CapabilityProviderInstallationState[],
    updatedAt:                IsoTimestamp,
  ): Promise<CapabilityBindingSupersessionResult>
}

// --- Invalidation types (§25) ---

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

// --- Builder interface (§15) ---

export interface CapabilityBindingBuildContext {
  readonly requirementSet:        CapabilityRequirementSet
  readonly resolutionArtifact:    ProviderResolutionArtifactProjection
  readonly installationArtifact?: CapabilityInstallationArtifactProjection
  readonly lockArtifact?:         CapabilityLockArtifactProjection
  readonly trustArtifact?:        CapabilityTrustArtifactProjection
}

export interface CapabilityBindingBuilder {
  prepare(
    draft:   CapabilityBindingDraft,
    context: CapabilityBindingBuildContext,
  ): CapabilityBindingPreparationResult

  materialize(
    prepared: PreparedCapabilityBinding,
    options?: { readonly supersedesBindingId?: CapabilityBindingId },
  ): CapabilityBinding

  supersede(
    existing:         CapabilityBindingRecord,
    replacementDraft: CapabilityBindingDraft,
    context:          CapabilityBindingBuildContext,
  ): CapabilityBindingSupersessionResult
}
