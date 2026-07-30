// Test fixture factories — NOT exported from the package.
// All values are deterministic; no clock/UUID calls.

import type {
  CapabilityBindingDraft,
  CapabilityBindingBuildContext,
  ResolvedProviderReference,
  ProviderResolutionArtifactProjection,
  CapabilityInstallationArtifactProjection,
  CapabilityInstallationEntryProjection,
  CapabilityLockArtifactProjection,
  CapabilityTrustArtifactProjection,
  CapabilityBindingInvalidationReason,
} from '@rohinik-org/capability-binding-ir'
import type {
  ProviderId,
  ProviderResolutionId,
  CapabilityId,
  CapabilityLockEntryHash,
  ContentHash,
} from '@rohinik-org/capability-binding-ir'
import type {
  CapabilityRequirementSet,
  CapabilityRequirementId,
  CapabilityRequirementSetId,
  CapabilityRequirementHash,
  CapabilityRequirementSetHash,
  IsoTimestamp,
} from '@rohinik-org/capability-contracts-ir'

// ── Shared constants ──────────────────────────────────────────────────────────

export const TEST_SET_ID          = 'set-001'    as CapabilityRequirementSetId
export const TEST_REQUIREMENT_ID  = 'req-001'    as CapabilityRequirementId
export const TEST_CAPABILITY_ID   = 'rhk:text:summarize@1' as CapabilityId
export const TEST_RESOLUTION_ID   = 'res-001'    as ProviderResolutionId
export const TEST_PROVIDER_ID     = 'provider-alpha' as ProviderId
export const TEST_PROVIDER_ID_B   = 'provider-beta'  as ProviderId

// 64-char lowercase hex hashes
export const H_REQ     = 'a'.repeat(64) as CapabilityRequirementHash
export const H_SET     = 'b'.repeat(64) as CapabilityRequirementSetHash
export const H_CONTENT = 'c'.repeat(64) as ContentHash
export const H_DESC    = 'd'.repeat(64) as ContentHash
export const H_LOCK    = 'f'.repeat(64) as CapabilityLockEntryHash
export const H_TRUST   = '1'.repeat(64) as ContentHash
export const H_RES_ENTRY = 'e'.repeat(64) as ContentHash
export const H_INSTALL_ENTRY = '4'.repeat(64) as ContentHash

export const CREATED_AT = '2026-07-24T00:00:00.000Z' as IsoTimestamp

// ── Base provider projection (no resolutionEntryHash per spec §8.1) ───────────

export function makeResolvedProviderProjection(overrides: {
  providerId?: ProviderId
  packageId?: string
  packageContentHash?: ContentHash
  providerDescriptorHash?: ContentHash
} = {}) {
  return {
    providerId:             overrides.providerId ?? TEST_PROVIDER_ID,
    providerVersion:        '1.0.0',
    capabilityVersion:      '1.0.0',
    providerDescriptorHash: overrides.providerDescriptorHash ?? H_DESC,
    packageId:              overrides.packageId ?? 'pkg-alpha',
    packageVersion:         '1.0.0',
    packageContentHash:     overrides.packageContentHash ?? H_CONTENT,
  }
}

// ── ResolvedProviderReference (no lockEntryHash/trustDecisionHash/installationId per spec §9) ──

export function createTestResolvedProviderReference(overrides: Partial<{
  providerId:             ProviderId
  packageId:              string
  packageVersion:         string
  packageContentHash:     ContentHash
  providerDescriptorHash: ContentHash
}> = {}): ResolvedProviderReference {
  return {
    providerId:             overrides.providerId ?? TEST_PROVIDER_ID,
    providerVersion:        '1.0.0',
    capabilityId:           TEST_CAPABILITY_ID,
    capabilityVersion:      '1.0.0',
    providerDescriptorHash: overrides.providerDescriptorHash ?? H_DESC,
    resolutionId:           TEST_RESOLUTION_ID,
    package: {
      packageId:          overrides.packageId ?? 'pkg-alpha',
      packageVersion:     overrides.packageVersion ?? '1.0.0',
      packageFormat:      'rpk',
      packageContentHash: overrides.packageContentHash ?? H_CONTENT,
    },
  }
}

export function createTestResolutionArtifact(
  overrides: Partial<ProviderResolutionArtifactProjection> = {},
): ProviderResolutionArtifactProjection {
  return {
    resolutionId:        TEST_RESOLUTION_ID,
    requirementId:       TEST_REQUIREMENT_ID,
    requirementHash:     H_REQ,
    capabilityId:        TEST_CAPABILITY_ID,
    multiplicity:        'single',
    selectedProviders:   [makeResolvedProviderProjection()],
    resolutionEntryHash: H_RES_ENTRY,
    ...overrides,
  }
}

export function createTestRequirementSet(overrides: Partial<{
  setId:           CapabilityRequirementSetId
  semanticHash:    CapabilityRequirementSetHash
  requirementId:   CapabilityRequirementId
  requirementHash: CapabilityRequirementHash
  capabilityId:    CapabilityId
  multiplicity:    'single' | 'one-or-more' | 'all-compatible'
}> = {}): CapabilityRequirementSet {
  const setId         = overrides.setId         ?? TEST_SET_ID
  const semanticHash  = overrides.semanticHash  ?? H_SET
  const requirementId = overrides.requirementId ?? TEST_REQUIREMENT_ID
  const requirementHash = overrides.requirementHash ?? H_REQ
  const capabilityId  = overrides.capabilityId  ?? TEST_CAPABILITY_ID
  const multiplicity  = overrides.multiplicity  ?? 'single'

  return {
    setId,
    semanticHash,
    schemaVersion: '1.0',
    requirements: [{
      requirementId,
      requirementHash,
      capabilityId,
      versionRange: { expression: '>=1.0.0', normalized: '>=1.0.0' as any },
      necessity:    'required',
      multiplicity,
      constraints:  [],
      preferences:  [],
      requestedBy: {
        direct: { kind: 'subsystem', subsystemName: 'test' },
        chain:  [],
      },
    }],
    createdAt: CREATED_AT,
  }
}

export function createTestBindingDraft(
  overrides: Partial<CapabilityBindingDraft> = {},
): CapabilityBindingDraft {
  const base: CapabilityBindingDraft = {
    setId:           TEST_SET_ID,
    semanticHash:    H_SET,
    requirementId:   TEST_REQUIREMENT_ID,
    requirementHash: H_REQ,
    capabilityId:    TEST_CAPABILITY_ID,
    multiplicity:    'single',
    resolutionId:    TEST_RESOLUTION_ID,
    providers:       [createTestResolvedProviderReference()],
  }
  return { ...base, ...overrides }
}

export function createTestInstallationArtifact(
  overrides: Partial<CapabilityInstallationArtifactProjection> = {},
): CapabilityInstallationArtifactProjection {
  const base: CapabilityInstallationArtifactProjection = {
    installationArtifactHash: '5'.repeat(64) as ContentHash,
    installations: [{
      providerId:              TEST_PROVIDER_ID,
      packageId:               'pkg-alpha',
      packageVersion:          '1.0.0',
      packageContentHash:      H_CONTENT,
      installationId:          'inst-001',
      installationPath:        '/opt/rhk/inst-001',
      installationEntryHash:   H_INSTALL_ENTRY,
    }],
  }
  return { ...base, ...overrides }
}

export function createTestInstallationEntry(overrides: Partial<CapabilityInstallationEntryProjection> = {}): CapabilityInstallationEntryProjection {
  return {
    providerId:            TEST_PROVIDER_ID,
    packageId:             'pkg-alpha',
    packageVersion:        '1.0.0',
    packageContentHash:    H_CONTENT,
    installationId:        'inst-001',
    installationPath:      '/opt/rhk/inst-001',
    installationEntryHash: H_INSTALL_ENTRY,
    ...overrides,
  }
}

export function createTestLockArtifact(
  overrides: Partial<CapabilityLockArtifactProjection> = {},
): CapabilityLockArtifactProjection {
  return {
    lockfileHash: '2'.repeat(64) as ContentHash,
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
    trustArtifactHash: '3'.repeat(64) as ContentHash,
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

// Full context: installation + lock + trust all present → ready-for-activation
export function createTestBindingBuildContext(
  overrides: Partial<CapabilityBindingBuildContext> = {},
): CapabilityBindingBuildContext {
  return {
    requirementSet:      createTestRequirementSet(),
    resolutionArtifact:  createTestResolutionArtifact(),
    installationArtifact: createTestInstallationArtifact(),
    lockArtifact:        createTestLockArtifact(),
    trustArtifact:       createTestTrustArtifact(),
    ...overrides,
  }
}

// Minimal context: no optional artifacts → planned state
export function createMinimalBindingBuildContext(
  overrides: Partial<CapabilityBindingBuildContext> = {},
): CapabilityBindingBuildContext {
  return {
    requirementSet:     createTestRequirementSet(),
    resolutionArtifact: createTestResolutionArtifact(),
    ...overrides,
  }
}

export const TEST_INVALIDATION_REASON: CapabilityBindingInvalidationReason = {
  code:       'REQUIREMENT_CHANGED',
  message:    'test invalidation',
  detectedAt: '2026-07-24T01:00:00.000Z' as IsoTimestamp,
}
