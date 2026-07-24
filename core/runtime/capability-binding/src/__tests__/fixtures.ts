// Test fixture factories — NOT exported from the package.
// All values are deterministic; no clock/UUID calls.

import type {
  CapabilityBindingDraft,
  CapabilityBindingBuildContext,
  ResolvedProviderReference,
  ProviderResolutionArtifactProjection,
  CapabilityLockArtifactProjection,
  CapabilityTrustArtifactProjection,
} from '@rohinik-org/capability-binding-ir'
import type {
  ProviderId,
  ProviderResolutionId,
  CapabilityId,
} from '@rohinik-org/capability-binding-ir'
import type {
  CapabilityRequirementSet,
  CapabilityRequirementId,
  CapabilityRequirementSetId,
  CapabilityRequirementHash,
  CapabilityRequirementSetHash,
  ContentHash,
  IsoTimestamp,
} from '@rohinik-org/capability-contracts-ir'
import type { CapabilityLockEntryHash } from '@rohinik-org/capability-binding-ir'

// ── Shared constants ──────────────────────────────────────────────────────────

export const TEST_SET_ID          = 'set-001' as CapabilityRequirementSetId
export const TEST_REQUIREMENT_ID  = 'req-001' as CapabilityRequirementId
export const TEST_CAPABILITY_ID   = 'rhk:text:summarize@1' as CapabilityId
export const TEST_RESOLUTION_ID   = 'res-001' as ProviderResolutionId
export const TEST_PROVIDER_ID     = 'provider-alpha' as ProviderId

// 64-char lowercase hex hashes
const H_REQ:     CapabilityRequirementHash    = 'a'.repeat(64) as CapabilityRequirementHash
const H_SET:     CapabilityRequirementSetHash = 'b'.repeat(64) as CapabilityRequirementSetHash
const H_CONTENT: ContentHash                 = 'c'.repeat(64) as ContentHash
const H_DESC:    ContentHash                 = 'd'.repeat(64) as ContentHash
const H_ENTRY:   ContentHash                 = 'e'.repeat(64) as ContentHash
const H_LOCK:    CapabilityLockEntryHash     = 'f'.repeat(64) as CapabilityLockEntryHash
const H_TRUST:   ContentHash                 = '1'.repeat(64) as ContentHash
const H_LOCK_FILE: ContentHash               = '2'.repeat(64) as ContentHash
const H_TRUST_FILE: ContentHash              = '3'.repeat(64) as ContentHash
const H_RES_ENTRY: ContentHash               = 'e'.repeat(64) as ContentHash

const CREATED_AT = '2026-07-24T00:00:00.000Z' as IsoTimestamp

// ── Factory functions ─────────────────────────────────────────────────────────

export function createTestProviderId(suffix = '1'): ProviderId {
  return `provider-${suffix}` as ProviderId
}

export function createTestResolutionId(suffix = '1'): ProviderResolutionId {
  return `res-${suffix}` as ProviderResolutionId
}

export function createTestResolvedProviderReference(
  overrides: Partial<ResolvedProviderReference> = {},
): ResolvedProviderReference {
  return {
    providerId:             TEST_PROVIDER_ID,
    providerVersion:        '1.0.0',
    capabilityId:           TEST_CAPABILITY_ID,
    capabilityVersion:      '1.0.0',
    providerDescriptorHash: H_DESC,
    resolutionId:           TEST_RESOLUTION_ID,
    resolutionEntryHash:    H_RES_ENTRY,
    package: {
      packageId:          'pkg-alpha',
      packageVersion:     '1.0.0',
      packageFormat:      'rpk',
      packageContentHash: H_CONTENT,
      installationId:     'inst-001',
    },
    lockEntryHash:     H_LOCK,
    trustDecisionHash: H_TRUST,
    ...overrides,
  }
}

export function createTestResolutionArtifact(
  overrides: Partial<ProviderResolutionArtifactProjection> = {},
): ProviderResolutionArtifactProjection {
  return {
    resolutionId:    TEST_RESOLUTION_ID,
    requirementId:   TEST_REQUIREMENT_ID,
    requirementHash: H_REQ,
    capabilityId:    TEST_CAPABILITY_ID,
    multiplicity:    'single',
    selectedProviders: [{
      providerId:             TEST_PROVIDER_ID,
      providerVersion:        '1.0.0',
      capabilityVersion:      '1.0.0',
      providerDescriptorHash: H_DESC,
      packageId:              'pkg-alpha',
      packageVersion:         '1.0.0',
      packageContentHash:     H_CONTENT,
      resolutionEntryHash:    H_RES_ENTRY,
    }],
    resolutionEntryHash: H_ENTRY,
    ...overrides,
  }
}

export function createTestRequirementSet(
  overrides: Partial<{
    setId: CapabilityRequirementSetId
    semanticHash: CapabilityRequirementSetHash
    requirementId: CapabilityRequirementId
    requirementHash: CapabilityRequirementHash
    capabilityId: CapabilityId
    multiplicity: 'single' | 'one-or-more' | 'all-compatible'
  }> = {},
): CapabilityRequirementSet {
  const setId          = overrides.setId          ?? TEST_SET_ID
  const semanticHash   = overrides.semanticHash   ?? H_SET
  const requirementId  = overrides.requirementId  ?? TEST_REQUIREMENT_ID
  const requirementHash = overrides.requirementHash ?? H_REQ
  const capabilityId   = overrides.capabilityId   ?? TEST_CAPABILITY_ID
  const multiplicity   = overrides.multiplicity   ?? 'single'

  return {
    setId,
    semanticHash,
    schemaVersion: '1.0',
    requirements: [{
      requirementId,
      requirementHash,
      capabilityId,
      versionRange: { expression: '>=1.0.0', normalized: '>=1.0.0' as any },
      necessity: 'required',
      multiplicity,
      constraints: [],
      preferences: [],
      requestedBy: {
        direct: { kind: 'subsystem', subsystemName: 'test' },
        chain: [],
      },
    }],
    createdAt: CREATED_AT,
  }
}

export function createTestBindingDraft(
  overrides: Partial<CapabilityBindingDraft> = {},
): CapabilityBindingDraft {
  const base: CapabilityBindingDraft = {
    setId:          TEST_SET_ID,
    semanticHash:   H_SET,
    requirementId:  TEST_REQUIREMENT_ID,
    requirementHash: H_REQ,
    capabilityId:   TEST_CAPABILITY_ID,
    multiplicity:   'single',
    resolutionId:   TEST_RESOLUTION_ID,
    providers:      [createTestResolvedProviderReference()],
  }
  return { ...base, ...overrides }
}

export function createTestLockArtifact(
  overrides: Partial<CapabilityLockArtifactProjection> = {},
): CapabilityLockArtifactProjection {
  return {
    lockfileHash: H_LOCK_FILE,
    entries: [{
      requirementId:      TEST_REQUIREMENT_ID,
      providerId:         TEST_PROVIDER_ID,
      packageId:          'pkg-alpha',
      packageVersion:     '1.0.0',
      packageContentHash: H_CONTENT,
      lockEntryHash:      H_LOCK,
    }],
    ...overrides,
  }
}

export function createTestTrustArtifact(
  overrides: Partial<CapabilityTrustArtifactProjection> = {},
): CapabilityTrustArtifactProjection {
  return {
    trustArtifactHash: H_TRUST_FILE,
    decisions: [{
      providerId:             TEST_PROVIDER_ID,
      providerDescriptorHash: H_DESC,
      packageContentHash:     H_CONTENT,
      decision:               'trusted',
      trustDecisionHash:      H_TRUST,
    }],
    ...overrides,
  }
}

export function createTestBindingBuildContext(
  overrides: Partial<CapabilityBindingBuildContext> = {},
): CapabilityBindingBuildContext {
  return {
    requirementSet:     createTestRequirementSet(),
    resolutionArtifact: createTestResolutionArtifact(),
    lockArtifact:       createTestLockArtifact(),
    trustArtifact:      createTestTrustArtifact(),
    ...overrides,
  }
}
