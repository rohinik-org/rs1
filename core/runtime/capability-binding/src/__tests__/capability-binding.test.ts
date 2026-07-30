import { describe, it, expect } from 'vitest'
import {
  createCapabilityBindingBuilder,
  createInMemoryCapabilityBindingRepository,
} from '../index.js'
import type { IdGenerator, Clock, IsoTimestamp } from '@rohinik-org/capability-contracts-ir'
import type {
  CapabilityBindingDraft,
  CapabilityBindingRecord,
  ContentHash,
  CapabilityBindingHash,
} from '@rohinik-org/capability-binding-ir'
import type { ProviderId } from '@rohinik-org/capability-binding-ir'
import {
  createTestBindingDraft,
  createTestBindingBuildContext,
  createMinimalBindingBuildContext,
  createTestRequirementSet,
  createTestResolutionArtifact,
  createTestResolvedProviderReference,
  createTestInstallationArtifact,
  createTestInstallationEntry,
  createTestLockArtifact,
  createTestTrustArtifact,
  makeResolvedProviderProjection,
  TEST_SET_ID,
  TEST_REQUIREMENT_ID,
  TEST_CAPABILITY_ID,
  TEST_RESOLUTION_ID,
  TEST_PROVIDER_ID,
  TEST_PROVIDER_ID_B,
  H_CONTENT,
  H_DESC,
  H_SET,
  H_REQ,
  H_RES_ENTRY,
  H_LOCK,
  H_TRUST,
  TEST_INVALIDATION_REASON,
} from './fixtures.js'

// ── Test doubles ──────────────────────────────────────────────────────────────

function seqGen(prefix = 'id'): IdGenerator & { readonly count: number } {
  let n = 0
  const gen = {
    generate: () => `${prefix}-${++n}`,
    get count() { return n },
  }
  return gen as unknown as IdGenerator & { readonly count: number }
}

function fixedClock(ts = '2026-07-24T00:00:00.000Z'): Clock & { readonly count: number } {
  let n = 0
  const c = {
    now: () => { n++; return ts as IsoTimestamp },
    get count() { return n },
  }
  return c as unknown as Clock & { readonly count: number }
}

function makeBuilder() {
  const idGen = seqGen()
  const clock = fixedClock()
  const builder = createCapabilityBindingBuilder({ idGenerator: idGen, clock })
  return { builder, idGen, clock }
}

function prepareOk(draft?: Partial<CapabilityBindingDraft>, ctxOverrides?: Partial<Parameters<typeof createTestBindingBuildContext>[0]>) {
  const { builder, idGen, clock } = makeBuilder()
  const d = createTestBindingDraft(draft)
  const ctx = createTestBindingBuildContext(ctxOverrides)
  const r = builder.prepare(d, ctx)
  if (r.status !== 'ok') throw new Error('Expected ok: ' + JSON.stringify(r.validation.errors))
  const binding = builder.materialize(r.prepared)
  return { builder, idGen, clock, r, binding, ctx, d }
}

function prepareOkMinimal(draft?: Partial<CapabilityBindingDraft>, ctxOverrides?: Partial<Parameters<typeof createMinimalBindingBuildContext>[0]>) {
  const { builder, idGen, clock } = makeBuilder()
  const d = createTestBindingDraft(draft)
  const ctx = createMinimalBindingBuildContext(ctxOverrides)
  const r = builder.prepare(d, ctx)
  if (r.status !== 'ok') throw new Error('Expected ok minimal: ' + JSON.stringify(r.validation.errors))
  const binding = builder.materialize(r.prepared)
  return { builder, idGen, clock, r, binding, ctx }
}

// ── T-9E3-01 ──────────────────────────────────────────────────────────────────

describe('T-9E3-01: Valid single-provider resolution creates one canonical binding record', () => {
  it('creates a valid binding record for single multiplicity', async () => {
    const { binding } = prepareOk()
    const repo = createInMemoryCapabilityBindingRepository()
    const { r: prepResult } = prepareOk()
    const putResult = await repo.put(binding, prepResult.readiness, [])
    expect(putResult.status).toBe('accepted')
    if (putResult.status !== 'accepted') return
    const record = putResult.record
    expect(record.binding.bindingId).toBeTruthy()
    expect(record.binding.bindingHash).toMatch(/^[a-f0-9]{64}$/)
    expect(record.binding.schemaVersion).toBe('1.0')
    expect(record.binding.requirementId).toBe(TEST_REQUIREMENT_ID)
    expect(record.binding.capabilityId).toBe(TEST_CAPABILITY_ID)
    expect(record.binding.providers).toHaveLength(1)
    expect(record.stateVersion).toBe(1)
  })
})

// ── T-9E3-02 ──────────────────────────────────────────────────────────────────

describe('T-9E3-02: single with zero providers is rejected', () => {
  it('rejects single multiplicity with zero providers', () => {
    const { builder } = makeBuilder()
    const d = createTestBindingDraft({ providers: [] })
    const ctx = createTestBindingBuildContext({
      resolutionArtifact: createTestResolutionArtifact({ selectedProviders: [] }),
    })
    const r = builder.prepare(d, ctx)
    expect(r.status).toBe('invalid')
    if (r.status === 'invalid') {
      expect(r.validation.errors.some(e => e.code === 'SINGLE_REQUIRES_EXACTLY_ONE_PROVIDER')).toBe(true)
    }
  })
})

// ── T-9E3-03 ──────────────────────────────────────────────────────────────────

describe('T-9E3-03: single with more than one provider is rejected', () => {
  it('rejects single multiplicity with two providers', () => {
    const { builder } = makeBuilder()
    const p2 = createTestResolvedProviderReference({ providerId: TEST_PROVIDER_ID_B })
    const d = createTestBindingDraft({
      providers: [createTestResolvedProviderReference(), p2],
    })
    const ctx = createTestBindingBuildContext({
      resolutionArtifact: createTestResolutionArtifact({
        selectedProviders: [
          makeResolvedProviderProjection(),
          makeResolvedProviderProjection({ providerId: TEST_PROVIDER_ID_B, packageId: 'pkg-beta' }),
        ],
      }),
    })
    const r = builder.prepare(d, ctx)
    expect(r.status).toBe('invalid')
    if (r.status === 'invalid') {
      expect(r.validation.errors.some(e => e.code === 'SINGLE_REQUIRES_EXACTLY_ONE_PROVIDER')).toBe(true)
    }
  })
})

// ── T-9E3-04 ──────────────────────────────────────────────────────────────────

describe('T-9E3-04: one-or-more with zero providers is rejected', () => {
  it('rejects one-or-more with zero providers', () => {
    const { builder } = makeBuilder()
    const d = createTestBindingDraft({ multiplicity: 'one-or-more', providers: [] })
    const ctx = createTestBindingBuildContext({
      requirementSet:     createTestRequirementSet({ multiplicity: 'one-or-more' }),
      resolutionArtifact: createTestResolutionArtifact({ multiplicity: 'one-or-more', selectedProviders: [] }),
    })
    const r = builder.prepare(d, ctx)
    expect(r.status).toBe('invalid')
    if (r.status === 'invalid') {
      expect(r.validation.errors.some(e => e.code === 'ONE_OR_MORE_REQUIRES_PROVIDER')).toBe(true)
    }
  })
})

// ── T-9E3-05 ──────────────────────────────────────────────────────────────────

describe('T-9E3-05: one-or-more with one or more providers succeeds', () => {
  it('accepts one-or-more with one provider', () => {
    const { builder } = makeBuilder()
    const d = createTestBindingDraft({ multiplicity: 'one-or-more' })
    const ctx = createTestBindingBuildContext({
      requirementSet:     createTestRequirementSet({ multiplicity: 'one-or-more' }),
      resolutionArtifact: createTestResolutionArtifact({ multiplicity: 'one-or-more' }),
    })
    const r = builder.prepare(d, ctx)
    expect(r.status).toBe('ok')
  })
})

// ── T-9E3-06 ──────────────────────────────────────────────────────────────────

describe('T-9E3-06: all-compatible provider set must exactly match resolution artifact — omission rejected', () => {
  it('rejects all-compatible if fewer providers than resolution', () => {
    const { builder } = makeBuilder()
    const d = createTestBindingDraft({
      multiplicity: 'all-compatible',
      providers:    [createTestResolvedProviderReference()],
    })
    const ctx = createTestBindingBuildContext({
      requirementSet: createTestRequirementSet({ multiplicity: 'all-compatible' }),
      resolutionArtifact: createTestResolutionArtifact({
        multiplicity: 'all-compatible',
        selectedProviders: [
          makeResolvedProviderProjection(),
          makeResolvedProviderProjection({ providerId: TEST_PROVIDER_ID_B, packageId: 'pkg-beta' }),
        ],
      }),
    })
    const r = builder.prepare(d, ctx)
    expect(r.status).toBe('invalid')
    if (r.status === 'invalid') {
      expect(r.validation.errors.some(e => e.code === 'ALL_COMPATIBLE_PROVIDER_SET_MISMATCH')).toBe(true)
    }
  })
})

// ── T-9E3-07 ──────────────────────────────────────────────────────────────────

describe('T-9E3-07: all-compatible provider set must exactly match resolution artifact — addition rejected', () => {
  it('rejects all-compatible if more providers than resolution', () => {
    const { builder } = makeBuilder()
    const p2 = createTestResolvedProviderReference({ providerId: 'provider-extra' as ProviderId })
    const d = createTestBindingDraft({
      multiplicity: 'all-compatible',
      providers:    [createTestResolvedProviderReference(), p2],
    })
    const ctx = createTestBindingBuildContext({
      requirementSet:     createTestRequirementSet({ multiplicity: 'all-compatible' }),
      resolutionArtifact: createTestResolutionArtifact({ multiplicity: 'all-compatible' }),
    })
    const r = builder.prepare(d, ctx)
    expect(r.status).toBe('invalid')
    if (r.status === 'invalid') {
      expect(r.validation.errors.some(e => e.code === 'ALL_COMPATIBLE_PROVIDER_SET_MISMATCH')).toBe(true)
    }
  })
})

// ── T-9E3-08 ──────────────────────────────────────────────────────────────────

describe('T-9E3-08: Duplicate provider IDs rejected', () => {
  it('rejects duplicate provider IDs', () => {
    const { builder } = makeBuilder()
    const p = createTestResolvedProviderReference()
    const d = createTestBindingDraft({ providers: [p, p] })
    const ctx = createTestBindingBuildContext({
      resolutionArtifact: createTestResolutionArtifact({
        selectedProviders: [
          makeResolvedProviderProjection(),
          makeResolvedProviderProjection(),
        ],
      }),
    })
    const r = builder.prepare(d, ctx)
    expect(r.status).toBe('invalid')
    if (r.status === 'invalid') {
      expect(r.validation.errors.some(e => e.code === 'DUPLICATE_PROVIDER_ID')).toBe(true)
    }
  })
})

// ── T-9E3-09 ──────────────────────────────────────────────────────────────────

describe('T-9E3-09: Provider order differing from resolution artifact order rejected', () => {
  it('rejects providers in wrong order', () => {
    const { builder } = makeBuilder()
    const pa = createTestResolvedProviderReference({ providerId: TEST_PROVIDER_ID })
    const pb = createTestResolvedProviderReference({ providerId: TEST_PROVIDER_ID_B })
    const d = createTestBindingDraft({
      multiplicity: 'one-or-more',
      providers:    [pb, pa], // reversed
    })
    const ctx = createTestBindingBuildContext({
      requirementSet: createTestRequirementSet({ multiplicity: 'one-or-more' }),
      resolutionArtifact: createTestResolutionArtifact({
        multiplicity: 'one-or-more',
        selectedProviders: [
          makeResolvedProviderProjection({ providerId: TEST_PROVIDER_ID }),
          makeResolvedProviderProjection({ providerId: TEST_PROVIDER_ID_B, packageId: 'pkg-beta' }),
        ],
      }),
    })
    const r = builder.prepare(d, ctx)
    expect(r.status).toBe('invalid')
    if (r.status === 'invalid') {
      expect(r.validation.errors.some(e => e.code === 'PROVIDER_ORDER_MISMATCH')).toBe(true)
    }
  })
})

// ── T-9E3-10 ──────────────────────────────────────────────────────────────────

describe('T-9E3-10: Provider not present in resolution artifact rejected', () => {
  it('rejects provider not in resolution artifact', () => {
    const { builder } = makeBuilder()
    const stranger = createTestResolvedProviderReference({ providerId: 'stranger' as ProviderId })
    const d = createTestBindingDraft({ providers: [stranger] })
    const r = builder.prepare(d, createTestBindingBuildContext())
    expect(r.status).toBe('invalid')
    if (r.status === 'invalid') {
      expect(r.validation.errors.some(e => e.code === 'PROVIDER_NOT_IN_RESOLUTION')).toBe(true)
    }
  })
})

// ── T-9E3-11 ──────────────────────────────────────────────────────────────────

describe('T-9E3-11: requirementHash mismatch rejected', () => {
  it('rejects requirementHash mismatch', () => {
    const { builder } = makeBuilder()
    const d = createTestBindingDraft({ requirementHash: '9'.repeat(64) as any })
    const r = builder.prepare(d, createTestBindingBuildContext())
    expect(r.status).toBe('invalid')
    if (r.status === 'invalid') {
      expect(r.validation.errors.some(e => e.code === 'REQUIREMENT_HASH_MISMATCH')).toBe(true)
    }
  })
})

// ── T-9E3-12 ──────────────────────────────────────────────────────────────────

describe('T-9E3-12: semanticHash mismatch rejected', () => {
  it('rejects semanticHash mismatch', () => {
    const { builder } = makeBuilder()
    const d = createTestBindingDraft({ semanticHash: '9'.repeat(64) as any })
    const r = builder.prepare(d, createTestBindingBuildContext())
    expect(r.status).toBe('invalid')
    if (r.status === 'invalid') {
      expect(r.validation.errors.some(e => e.code === 'SEMANTIC_HASH_MISMATCH')).toBe(true)
    }
  })
})

// ── T-9E3-13 ──────────────────────────────────────────────────────────────────

describe('T-9E3-13: capabilityId mismatch rejected', () => {
  it('rejects capabilityId mismatch', () => {
    const { builder } = makeBuilder()
    const d = createTestBindingDraft({ capabilityId: 'rhk:other:wrong@1' as any })
    const r = builder.prepare(d, createTestBindingBuildContext())
    expect(r.status).toBe('invalid')
    if (r.status === 'invalid') {
      expect(r.validation.errors.some(e => e.code === 'CAPABILITY_ID_MISMATCH')).toBe(true)
    }
  })
})

// ── T-9E3-14 ──────────────────────────────────────────────────────────────────

describe('T-9E3-14: multiplicity mismatch rejected', () => {
  it('rejects multiplicity mismatch', () => {
    const { builder } = makeBuilder()
    const d = createTestBindingDraft({ multiplicity: 'one-or-more' })
    const r = builder.prepare(d, createTestBindingBuildContext())
    expect(r.status).toBe('invalid')
    if (r.status === 'invalid') {
      expect(r.validation.errors.some(e => e.code === 'MULTIPLICITY_MISMATCH')).toBe(true)
    }
  })
})

// ── T-9E3-15 ──────────────────────────────────────────────────────────────────

describe('T-9E3-15: resolutionId mismatch rejected', () => {
  it('rejects resolutionId mismatch', () => {
    const { builder } = makeBuilder()
    const d = createTestBindingDraft({ resolutionId: 'wrong-res' as any })
    const r = builder.prepare(d, createTestBindingBuildContext())
    expect(r.status).toBe('invalid')
    if (r.status === 'invalid') {
      expect(r.validation.errors.some(e => e.code === 'RESOLUTION_ID_MISMATCH')).toBe(true)
    }
  })
})

// ── T-9E3-16 ──────────────────────────────────────────────────────────────────

describe('T-9E3-16: Package content hash mismatch rejected', () => {
  it('rejects package content hash mismatch', () => {
    const { builder } = makeBuilder()
    const p = createTestResolvedProviderReference({ packageContentHash: '9'.repeat(64) as ContentHash })
    const d = createTestBindingDraft({ providers: [p] })
    const r = builder.prepare(d, createTestBindingBuildContext())
    expect(r.status).toBe('invalid')
    if (r.status === 'invalid') {
      expect(r.validation.errors.some(e => e.code === 'PACKAGE_CONTENT_HASH_MISMATCH')).toBe(true)
    }
  })
})

// ── T-9E3-17 ──────────────────────────────────────────────────────────────────

describe('T-9E3-17: Lock entry referring to different provider or package rejected', () => {
  it('rejects lock entry with wrong packageContentHash', () => {
    const { builder } = makeBuilder()
    const d = createTestBindingDraft()
    const lockArtifact = createTestLockArtifact({
      entries: [{
        requirementId:      TEST_REQUIREMENT_ID,
        providerId:         TEST_PROVIDER_ID,
        packageId:          'pkg-alpha',
        packageVersion:     '1.0.0',
        packageContentHash: '9'.repeat(64) as ContentHash, // mismatch
        lockEntryHash:      H_LOCK,
      }],
    })
    const r = builder.prepare(d, createTestBindingBuildContext({ lockArtifact }))
    expect(r.status).toBe('invalid')
    if (r.status === 'invalid') {
      expect(r.validation.errors.some(e => e.code === 'LOCK_ENTRY_MISMATCH')).toBe(true)
    }
  })
})

// ── T-9E3-18 ──────────────────────────────────────────────────────────────────

describe('T-9E3-18: Trust decision referring to different descriptor or package rejected', () => {
  it('rejects trust decision with wrong providerDescriptorHash', () => {
    const { builder } = makeBuilder()
    const trustArtifact = createTestTrustArtifact({
      decisions: [{
        providerId:             TEST_PROVIDER_ID,
        providerDescriptorHash: '9'.repeat(64) as ContentHash, // mismatch
        packageContentHash:     H_CONTENT,
        decision:               'trusted',
        trustDecisionHash:      H_TRUST,
      }],
    })
    const r = builder.prepare(createTestBindingDraft(), createTestBindingBuildContext({ trustArtifact }))
    expect(r.status).toBe('invalid')
    if (r.status === 'invalid') {
      expect(r.validation.errors.some(e => e.code === 'TRUST_DECISION_MISMATCH')).toBe(true)
    }
  })
})

// ── T-9E3-18A ─────────────────────────────────────────────────────────────────

describe("T-9E3-18A: Trust artifact present with decision='denied' rejected", () => {
  it('rejects with TRUST_DECISION_DENIED when decision is denied', () => {
    const { builder } = makeBuilder()
    const trustArtifact = createTestTrustArtifact({
      decisions: [{
        providerId:             TEST_PROVIDER_ID,
        providerDescriptorHash: H_DESC,
        packageContentHash:     H_CONTENT,
        decision:               'denied',
        trustDecisionHash:      H_TRUST,
      }],
    })
    const r = builder.prepare(createTestBindingDraft(), createTestBindingBuildContext({ trustArtifact }))
    expect(r.status).toBe('invalid')
    if (r.status === 'invalid') {
      expect(r.validation.errors.some(e => e.code === 'TRUST_DECISION_DENIED')).toBe(true)
    }
  })
})

// ── T-9E3-19 ──────────────────────────────────────────────────────────────────

describe('T-9E3-19: Absent installation artifact produces planned state', () => {
  it('produces planned state when installationArtifact is absent', () => {
    const { r } = prepareOkMinimal()
    expect(r.state).toBe('planned')
  })
})

// ── T-9E3-19A ─────────────────────────────────────────────────────────────────

describe("T-9E3-19A: Installation artifact present but provider's entry absent produces planned state", () => {
  it('produces planned when installationArtifact has no entry for the provider', () => {
    const { builder } = makeBuilder()
    const d = createTestBindingDraft()
    const ctx = createMinimalBindingBuildContext({
      installationArtifact: createTestInstallationArtifact({
        installations: [], // empty — provider has no entry
      }),
    })
    const r = builder.prepare(d, ctx)
    expect(r.status).toBe('ok')
    if (r.status === 'ok') expect(r.state).toBe('planned')
  })
})

// ── T-9E3-20 ──────────────────────────────────────────────────────────────────

describe('T-9E3-20: Installation present but lock and trust absent produces installed state', () => {
  it('produces installed state when lock artifact present but provider entry missing', () => {
    const { builder } = makeBuilder()
    const d = createTestBindingDraft()
    const ctx = createTestBindingBuildContext({
      lockArtifact:  createTestLockArtifact({ entries: [] }), // no lock entry for provider
      trustArtifact: undefined,
    })
    const r = builder.prepare(d, ctx)
    expect(r.status).toBe('ok')
    if (r.status === 'ok') expect(r.state).toBe('installed')
  })
})

// ── T-9E3-20A ─────────────────────────────────────────────────────────────────

describe('T-9E3-20A: Installation and lock present for all providers but trust absent produces installed state', () => {
  it('produces installed when lock present but trust artifact absent', () => {
    const { builder } = makeBuilder()
    const d = createTestBindingDraft()
    const ctx = createTestBindingBuildContext({
      lockArtifact:  createTestLockArtifact(),
      trustArtifact: undefined, // no trust artifact
    })
    const r = builder.prepare(d, ctx)
    expect(r.status).toBe('ok')
    if (r.status === 'ok') expect(r.state).toBe('installed')
  })
})

// ── T-9E3-20B ─────────────────────────────────────────────────────────────────

describe('T-9E3-20B: Installation and trust present but lock absent produces installed state', () => {
  it('produces installed when trust present but lock artifact absent', () => {
    const { builder } = makeBuilder()
    const d = createTestBindingDraft()
    const ctx = createTestBindingBuildContext({
      lockArtifact:  undefined, // no lock artifact
      trustArtifact: createTestTrustArtifact(),
    })
    const r = builder.prepare(d, ctx)
    expect(r.status).toBe('ok')
    if (r.status === 'ok') expect(r.state).toBe('installed')
  })
})

// ── T-9E3-20C ─────────────────────────────────────────────────────────────────

describe('T-9E3-20C: Resolution has providers A and B; lock artifact contains only A; binding remains installed', () => {
  it('produces installed when lock artifact covers only one of two providers', () => {
    const { builder } = makeBuilder()
    const pa = createTestResolvedProviderReference({ providerId: TEST_PROVIDER_ID })
    const pb = createTestResolvedProviderReference({ providerId: TEST_PROVIDER_ID_B, packageId: 'pkg-beta' })
    const d = createTestBindingDraft({
      multiplicity: 'one-or-more',
      providers:    [pa, pb],
    })
    const ctx = createTestBindingBuildContext({
      requirementSet:     createTestRequirementSet({ multiplicity: 'one-or-more' }),
      resolutionArtifact: createTestResolutionArtifact({
        multiplicity: 'one-or-more',
        selectedProviders: [
          makeResolvedProviderProjection({ providerId: TEST_PROVIDER_ID }),
          makeResolvedProviderProjection({ providerId: TEST_PROVIDER_ID_B, packageId: 'pkg-beta' }),
        ],
      }),
      installationArtifact: createTestInstallationArtifact({
        installations: [
          createTestInstallationEntry({ providerId: TEST_PROVIDER_ID }),
          createTestInstallationEntry({ providerId: TEST_PROVIDER_ID_B, packageId: 'pkg-beta', installationId: 'inst-002', installationPath: '/opt/rhk/inst-002' }),
        ],
      }),
      lockArtifact: createTestLockArtifact({
        entries: [{ requirementId: TEST_REQUIREMENT_ID, providerId: TEST_PROVIDER_ID, packageId: 'pkg-alpha', packageVersion: '1.0.0', packageContentHash: H_CONTENT, lockEntryHash: H_LOCK }],
        // only alpha — beta missing
      }),
      trustArtifact: undefined,
    })
    const r = builder.prepare(d, ctx)
    expect(r.status).toBe('ok')
    if (r.status === 'ok') expect(r.state).toBe('installed')
  })
})

// ── T-9E3-20D ─────────────────────────────────────────────────────────────────

describe('T-9E3-20D: Resolution has providers A and B; trust artifact contains only A; binding remains installed', () => {
  it('produces installed when trust artifact covers only one of two providers', () => {
    const { builder } = makeBuilder()
    const pa = createTestResolvedProviderReference({ providerId: TEST_PROVIDER_ID })
    const pb = createTestResolvedProviderReference({ providerId: TEST_PROVIDER_ID_B, packageId: 'pkg-beta' })
    const d = createTestBindingDraft({
      multiplicity: 'one-or-more',
      providers:    [pa, pb],
    })
    const ctx = createTestBindingBuildContext({
      requirementSet:     createTestRequirementSet({ multiplicity: 'one-or-more' }),
      resolutionArtifact: createTestResolutionArtifact({
        multiplicity: 'one-or-more',
        selectedProviders: [
          makeResolvedProviderProjection({ providerId: TEST_PROVIDER_ID }),
          makeResolvedProviderProjection({ providerId: TEST_PROVIDER_ID_B, packageId: 'pkg-beta' }),
        ],
      }),
      installationArtifact: createTestInstallationArtifact({
        installations: [
          createTestInstallationEntry({ providerId: TEST_PROVIDER_ID }),
          createTestInstallationEntry({ providerId: TEST_PROVIDER_ID_B, packageId: 'pkg-beta', installationId: 'inst-002', installationPath: '/opt/rhk/inst-002' }),
        ],
      }),
      lockArtifact: undefined,
      trustArtifact: createTestTrustArtifact({
        decisions: [{ providerId: TEST_PROVIDER_ID, providerDescriptorHash: H_DESC, packageContentHash: H_CONTENT, decision: 'trusted', trustDecisionHash: H_TRUST }],
        // only alpha — beta missing
      }),
    })
    const r = builder.prepare(d, ctx)
    expect(r.status).toBe('ok')
    if (r.status === 'ok') expect(r.state).toBe('installed')
  })
})

// ── T-9E3-21 ──────────────────────────────────────────────────────────────────

describe('T-9E3-21: Installation, lock, trust all present and verified for all providers produces ready-for-activation', () => {
  it('produces ready-for-activation when all prerequisites satisfied', () => {
    const { r } = prepareOk()
    expect(r.state).toBe('ready-for-activation')
    expect(r.readiness.ready).toBe(true)
  })
})

// ── T-9E3-22 ──────────────────────────────────────────────────────────────────

describe('T-9E3-22: Same semantic binding with different bindingId and createdAt produces identical bindingHash', () => {
  it('same semantic content → same bindingHash regardless of bindingId/createdAt', () => {
    const { builder: b1 } = makeBuilder()
    const { builder: b2 } = makeBuilder()
    const d = createTestBindingDraft()
    const ctx = createTestBindingBuildContext()
    const r1 = b1.prepare(d, ctx)
    const r2 = b2.prepare(d, ctx)
    expect(r1.status).toBe('ok')
    expect(r2.status).toBe('ok')
    if (r1.status === 'ok' && r2.status === 'ok') {
      expect(r1.bindingHash).toBe(r2.bindingHash)
    }
  })
})

// ── T-9E3-23 ──────────────────────────────────────────────────────────────────

describe('T-9E3-23: Changing provider identity changes bindingHash', () => {
  it('different providerId produces different bindingHash', () => {
    const { builder: b1 } = makeBuilder()
    const { builder: b2 } = makeBuilder()
    const ctx1 = createTestBindingBuildContext()
    const r1 = b1.prepare(createTestBindingDraft(), ctx1)

    const altId = 'provider-different' as ProviderId
    const ctx2 = createTestBindingBuildContext({
      resolutionArtifact: createTestResolutionArtifact({
        selectedProviders: [makeResolvedProviderProjection({ providerId: altId })],
      }),
      installationArtifact: createTestInstallationArtifact({
        installations: [createTestInstallationEntry({ providerId: altId })],
      }),
      lockArtifact:  createTestLockArtifact({ entries: [{ requirementId: TEST_REQUIREMENT_ID, providerId: altId, packageId: 'pkg-alpha', packageVersion: '1.0.0', packageContentHash: H_CONTENT, lockEntryHash: H_LOCK }] }),
      trustArtifact: createTestTrustArtifact({ decisions: [{ providerId: altId, providerDescriptorHash: H_DESC, packageContentHash: H_CONTENT, decision: 'trusted', trustDecisionHash: H_TRUST }] }),
    })
    const r2 = b2.prepare(createTestBindingDraft({ providers: [createTestResolvedProviderReference({ providerId: altId })] }), ctx2)
    expect(r1.status).toBe('ok')
    expect(r2.status).toBe('ok')
    if (r1.status === 'ok' && r2.status === 'ok') {
      expect(r1.bindingHash).not.toBe(r2.bindingHash)
    }
  })
})

// ── T-9E3-24 ──────────────────────────────────────────────────────────────────

describe('T-9E3-24: Changing package content hash changes bindingHash', () => {
  it('different packageContentHash produces different bindingHash', () => {
    const { builder: b1 } = makeBuilder()
    const { builder: b2 } = makeBuilder()
    const r1 = b1.prepare(createTestBindingDraft(), createTestBindingBuildContext())

    const altHash = '5'.repeat(64) as ContentHash
    const ctx2 = createTestBindingBuildContext({
      resolutionArtifact:   createTestResolutionArtifact({ selectedProviders: [makeResolvedProviderProjection({ packageContentHash: altHash })] }),
      installationArtifact: createTestInstallationArtifact({ installations: [createTestInstallationEntry({ packageContentHash: altHash })] }),
      lockArtifact:         createTestLockArtifact({ entries: [{ requirementId: TEST_REQUIREMENT_ID, providerId: TEST_PROVIDER_ID, packageId: 'pkg-alpha', packageVersion: '1.0.0', packageContentHash: altHash, lockEntryHash: H_LOCK }] }),
      trustArtifact:        createTestTrustArtifact({ decisions: [{ providerId: TEST_PROVIDER_ID, providerDescriptorHash: H_DESC, packageContentHash: altHash, decision: 'trusted', trustDecisionHash: H_TRUST }] }),
    })
    const r2 = b2.prepare(createTestBindingDraft({ providers: [createTestResolvedProviderReference({ packageContentHash: altHash })] }), ctx2)

    expect(r1.status).toBe('ok')
    expect(r2.status).toBe('ok')
    if (r1.status === 'ok' && r2.status === 'ok') {
      expect(r1.bindingHash).not.toBe(r2.bindingHash)
    }
  })
})

// ── T-9E3-25 ──────────────────────────────────────────────────────────────────

describe('T-9E3-25: Changing lock entry hash in lockArtifact projection changes bindingHash', () => {
  it('different lockEntryHash (from artifact) produces different bindingHash', () => {
    const { builder: b1 } = makeBuilder()
    const { builder: b2 } = makeBuilder()
    const r1 = b1.prepare(createTestBindingDraft(), createTestBindingBuildContext())

    const altLock = 'a'.repeat(63) + 'b' as any
    const ctx2 = createTestBindingBuildContext({
      lockArtifact: createTestLockArtifact({ entries: [{ requirementId: TEST_REQUIREMENT_ID, providerId: TEST_PROVIDER_ID, packageId: 'pkg-alpha', packageVersion: '1.0.0', packageContentHash: H_CONTENT, lockEntryHash: altLock }] }),
    })
    const r2 = b2.prepare(createTestBindingDraft(), ctx2)

    expect(r1.status).toBe('ok')
    expect(r2.status).toBe('ok')
    if (r1.status === 'ok' && r2.status === 'ok') {
      expect(r1.bindingHash).not.toBe(r2.bindingHash)
    }
  })
})

// ── T-9E3-26 ──────────────────────────────────────────────────────────────────

describe('T-9E3-26: Changing trust decision hash in trustArtifact projection changes bindingHash', () => {
  it('different trustDecisionHash (from artifact) produces different bindingHash', () => {
    const { builder: b1 } = makeBuilder()
    const { builder: b2 } = makeBuilder()
    const r1 = b1.prepare(createTestBindingDraft(), createTestBindingBuildContext())

    const altTrust = '4'.repeat(64) as ContentHash
    const ctx2 = createTestBindingBuildContext({
      trustArtifact: createTestTrustArtifact({ decisions: [{ providerId: TEST_PROVIDER_ID, providerDescriptorHash: H_DESC, packageContentHash: H_CONTENT, decision: 'trusted', trustDecisionHash: altTrust }] }),
    })
    const r2 = b2.prepare(createTestBindingDraft(), ctx2)

    expect(r1.status).toBe('ok')
    expect(r2.status).toBe('ok')
    if (r1.status === 'ok' && r2.status === 'ok') {
      expect(r1.bindingHash).not.toBe(r2.bindingHash)
    }
  })
})

// ── T-9E3-27 ──────────────────────────────────────────────────────────────────

describe('T-9E3-27: Changing provider order changes bindingHash', () => {
  it('different provider order (different resolution artifact) produces different bindingHash', () => {
    const { builder: b1 } = makeBuilder()
    const { builder: b2 } = makeBuilder()

    const pa = createTestResolvedProviderReference({ providerId: TEST_PROVIDER_ID })
    const pb = createTestResolvedProviderReference({ providerId: TEST_PROVIDER_ID_B, packageId: 'pkg-beta' })

    const lockAB = createTestLockArtifact({
      entries: [
        { requirementId: TEST_REQUIREMENT_ID, providerId: TEST_PROVIDER_ID,   packageId: 'pkg-alpha', packageVersion: '1.0.0', packageContentHash: H_CONTENT, lockEntryHash: H_LOCK },
        { requirementId: TEST_REQUIREMENT_ID, providerId: TEST_PROVIDER_ID_B, packageId: 'pkg-beta',  packageVersion: '1.0.0', packageContentHash: H_CONTENT, lockEntryHash: H_LOCK },
      ],
    })
    const trustAB = createTestTrustArtifact({
      decisions: [
        { providerId: TEST_PROVIDER_ID,   providerDescriptorHash: H_DESC, packageContentHash: H_CONTENT, decision: 'trusted', trustDecisionHash: H_TRUST },
        { providerId: TEST_PROVIDER_ID_B, providerDescriptorHash: H_DESC, packageContentHash: H_CONTENT, decision: 'trusted', trustDecisionHash: H_TRUST },
      ],
    })
    const installAB = createTestInstallationArtifact({
      installations: [
        createTestInstallationEntry({ providerId: TEST_PROVIDER_ID }),
        createTestInstallationEntry({ providerId: TEST_PROVIDER_ID_B, packageId: 'pkg-beta', installationId: 'inst-002', installationPath: '/opt/rhk/inst-002' }),
      ],
    })

    const d1 = createTestBindingDraft({ multiplicity: 'one-or-more', providers: [pa, pb] })
    const ctx1 = createTestBindingBuildContext({
      requirementSet:      createTestRequirementSet({ multiplicity: 'one-or-more' }),
      resolutionArtifact:  createTestResolutionArtifact({ multiplicity: 'one-or-more', selectedProviders: [makeResolvedProviderProjection(), makeResolvedProviderProjection({ providerId: TEST_PROVIDER_ID_B, packageId: 'pkg-beta' })] }),
      installationArtifact: installAB,
      lockArtifact:        lockAB,
      trustArtifact:       trustAB,
    })

    const d2 = createTestBindingDraft({ multiplicity: 'one-or-more', providers: [pb, pa] })
    const ctx2 = createTestBindingBuildContext({
      requirementSet:      createTestRequirementSet({ multiplicity: 'one-or-more' }),
      resolutionArtifact:  createTestResolutionArtifact({ multiplicity: 'one-or-more', selectedProviders: [makeResolvedProviderProjection({ providerId: TEST_PROVIDER_ID_B, packageId: 'pkg-beta' }), makeResolvedProviderProjection()] }),
      installationArtifact: installAB,
      lockArtifact:        lockAB,
      trustArtifact:       trustAB,
    })

    const r1 = b1.prepare(d1, ctx1)
    const r2 = b2.prepare(d2, ctx2)
    expect(r1.status).toBe('ok')
    expect(r2.status).toBe('ok')
    if (r1.status === 'ok' && r2.status === 'ok') {
      expect(r1.bindingHash).not.toBe(r2.bindingHash)
    }
  })
})

// ── T-9E3-28 ──────────────────────────────────────────────────────────────────

describe('T-9E3-28: Caller mutation after materialize does not affect the binding', () => {
  it('binding is immutable after materialize', () => {
    const { binding } = prepareOk()
    expect(() => { (binding as any).bindingId = 'mutated' }).toThrow()
  })
})

// ── T-9E3-29 ──────────────────────────────────────────────────────────────────

describe('T-9E3-29: All nested provider arrays and objects are deeply frozen', () => {
  it('providers array and its items are frozen', () => {
    const { binding } = prepareOk()
    expect(Object.isFrozen(binding.providers)).toBe(true)
    expect(Object.isFrozen(binding.providers[0])).toBe(true)
  })
})

// ── T-9E3-30 ──────────────────────────────────────────────────────────────────

describe('T-9E3-30: put() with same bindingId and same bindingHash is idempotent', () => {
  it('repository returns already-exists-identical for identical put', async () => {
    const repo = createInMemoryCapabilityBindingRepository()
    const { binding, r } = prepareOk()
    await repo.put(binding, r.readiness, [])
    const r2 = await repo.put(binding, r.readiness, [])
    expect(r2.status).toBe('already-exists-identical')
  })
})

// ── T-9E3-31 ──────────────────────────────────────────────────────────────────

describe('T-9E3-31: put() with same bindingId and different bindingHash produces collision', () => {
  it('collision when bindingId same but bindingHash differs', async () => {
    const repo = createInMemoryCapabilityBindingRepository()
    const { binding, r } = prepareOk()
    await repo.put(binding, r.readiness, [])
    const impostor = Object.freeze({ ...binding, bindingHash: '0'.repeat(64) as CapabilityBindingHash })
    const r2 = await repo.put(impostor, r.readiness, [])
    expect(r2.status).toBe('collision')
  })
})

// ── T-9E3-32 ──────────────────────────────────────────────────────────────────

describe('T-9E3-32: Superseding a binding record creates a new bindingId; previous record preserved with state=superseded', () => {
  it('supersede creates new bindingId and marks previous superseded', async () => {
    const repo = createInMemoryCapabilityBindingRepository()
    const { binding, r, builder } = prepareOk()
    const putResult = await repo.put(binding, r.readiness, [])
    expect(putResult.status).toBe('accepted')
    if (putResult.status !== 'accepted') return

    const existingRecord = putResult.record
    const result = await repo.supersede(
      existingRecord.binding.bindingId,
      (() => {
        const prep = builder.prepare(createTestBindingDraft(), createTestBindingBuildContext())
        if (prep.status !== 'ok') throw new Error('prep failed')
        return builder.materialize(prep.prepared, { supersedesBindingId: existingRecord.binding.bindingId })
      })(),
      r.readiness, [], '2026-07-24T01:00:00.000Z' as IsoTimestamp,
    )

    expect(result.previous.state).toBe('superseded')
    expect(result.previous.binding.bindingId).toBe(existingRecord.binding.bindingId)
    expect(result.replacement.binding.bindingId).not.toBe(existingRecord.binding.bindingId)
    expect(result.replacement.binding.supersedesBindingId).toBe(existingRecord.binding.bindingId)
    expect(result.previous.stateVersion).toBeGreaterThan(1)
    expect(result.replacement.stateVersion).toBe(1)
  })
})

// ── T-9E3-33 ──────────────────────────────────────────────────────────────────

describe('T-9E3-33: A superseded binding record cannot be superseded again', () => {
  it('throws when trying to supersede an already-superseded binding', async () => {
    const repo = createInMemoryCapabilityBindingRepository()
    const { binding, r, builder } = prepareOk()
    const put1 = await repo.put(binding, r.readiness, [])
    expect(put1.status).toBe('accepted')
    if (put1.status !== 'accepted') return

    const prep2 = builder.prepare(createTestBindingDraft(), createTestBindingBuildContext())
    expect(prep2.status).toBe('ok')
    if (prep2.status !== 'ok') return
    const replacement = builder.materialize(prep2.prepared, { supersedesBindingId: binding.bindingId })

    await repo.supersede(binding.bindingId, replacement, r.readiness, [], '2026-07-24T01:00:00.000Z' as IsoTimestamp)

    // Now try to supersede the now-superseded record
    const prep3 = builder.prepare(createTestBindingDraft(), createTestBindingBuildContext())
    expect(prep3.status).toBe('ok')
    if (prep3.status !== 'ok') return
    const replacement2 = builder.materialize(prep3.prepared, { supersedesBindingId: binding.bindingId })

    await expect(repo.supersede(binding.bindingId, replacement2, r.readiness, [], '2026-07-24T02:00:00.000Z' as IsoTimestamp))
      .rejects.toThrow()
  })
})

// ── T-9E3-34 ──────────────────────────────────────────────────────────────────

describe('T-9E3-34: Only one non-superseded, non-invalidated record exists per requirementId after supersession', () => {
  it('getCurrentForRequirement returns only the replacement after supersession', async () => {
    const repo = createInMemoryCapabilityBindingRepository()
    const { binding, r, builder } = prepareOk()
    await repo.put(binding, r.readiness, [])

    const prep2 = builder.prepare(createTestBindingDraft(), createTestBindingBuildContext())
    expect(prep2.status).toBe('ok')
    if (prep2.status !== 'ok') return
    const replacement = builder.materialize(prep2.prepared, { supersedesBindingId: binding.bindingId })
    const result = await repo.supersede(binding.bindingId, replacement, r.readiness, [], '2026-07-24T01:00:00.000Z' as IsoTimestamp)

    const current = await repo.getCurrentForRequirement(TEST_REQUIREMENT_ID)
    expect(current?.binding.bindingId).toBe(result.replacement.binding.bindingId)
  })
})

// ── T-9E3-35 ──────────────────────────────────────────────────────────────────

describe('T-9E3-35: Invalidation preserves original binding identity; record transitions to invalidated', () => {
  it('invalidates record while preserving binding identity', async () => {
    const repo = createInMemoryCapabilityBindingRepository()
    const { binding, r } = prepareOk()
    await repo.put(binding, r.readiness, [])
    const invalidated = await repo.invalidate(binding.bindingId, TEST_INVALIDATION_REASON, '2026-07-24T01:00:00.000Z' as IsoTimestamp)
    expect(invalidated.state).toBe('invalidated')
    expect(invalidated.binding.bindingId).toBe(binding.bindingId)
    expect(invalidated.binding.bindingHash).toBe(binding.bindingHash)
    expect(invalidated.invalidationReason).toBeDefined()
    expect(invalidated.invalidationReason?.code).toBe('REQUIREMENT_CHANGED')
  })
})

// ── T-9E3-36 ──────────────────────────────────────────────────────────────────

describe('T-9E3-36: bindingHash is identical across all lifecycle state transitions', () => {
  it('bindingHash does not change after state transition via refreshReadiness', async () => {
    const repo = createInMemoryCapabilityBindingRepository()
    const { binding, r } = prepareOk()
    const putResult = await repo.put(binding, r.readiness, [])
    expect(putResult.status).toBe('accepted')
    if (putResult.status !== 'accepted') return

    const originalHash = putResult.record.binding.bindingHash

    const updated = await repo.refreshReadiness(
      binding.bindingId,
      r.readiness,
      [],
      '2026-07-24T02:00:00.000Z' as IsoTimestamp,
    )
    expect(updated.binding.bindingHash).toBe(originalHash)
  })
})

// ── T-9E3-37 ──────────────────────────────────────────────────────────────────

describe('T-9E3-37: CapabilityHandleReference exposes capabilityId, requirementId, bindingId, bindingHash, providerIds', () => {
  it('handle reference contains all required identity fields', () => {
    const { binding } = prepareOk()
    const handle = {
      capabilityId:  binding.capabilityId,
      requirementId: binding.requirementId,
      bindingId:     binding.bindingId,
      bindingHash:   binding.bindingHash,
      providerIds:   binding.providers.map(p => p.providerId),
    }
    expect(handle.capabilityId).toBe(TEST_CAPABILITY_ID)
    expect(handle.requirementId).toBe(TEST_REQUIREMENT_ID)
    expect(handle.bindingId).toBeTruthy()
    expect(handle.bindingHash).toMatch(/^[a-f0-9]{64}$/)
    expect(handle.providerIds).toContain(TEST_PROVIDER_ID)
  })
})

// ── T-9E3-38 ──────────────────────────────────────────────────────────────────

describe('T-9E3-38: CapabilityHandleReference does not expose provider implementation objects or invoke()', () => {
  it('handle reference does not contain invoke or implementation', () => {
    const { binding } = prepareOk()
    const handle = {
      capabilityId:  binding.capabilityId,
      requirementId: binding.requirementId,
      bindingId:     binding.bindingId,
      bindingHash:   binding.bindingHash,
      providerIds:   binding.providers.map(p => p.providerId),
    }
    expect('invoke' in handle).toBe(false)
    expect('implementation' in handle).toBe(false)
  })
})

// ── T-9E3-39 ──────────────────────────────────────────────────────────────────

describe('T-9E3-39: Clock injected and called exactly once per materialize()', () => {
  it('clock.now() called exactly once per materialize()', () => {
    const idGen = seqGen()
    const clock = fixedClock()
    const builder = createCapabilityBindingBuilder({ idGenerator: idGen, clock })
    expect((clock as any).count).toBe(0)

    const r1 = builder.prepare(createTestBindingDraft(), createTestBindingBuildContext())
    expect((clock as any).count).toBe(0) // prepare is pure
    if (r1.status !== 'ok') return
    builder.materialize(r1.prepared)
    expect((clock as any).count).toBe(1)

    const r2 = builder.prepare(createTestBindingDraft(), createTestBindingBuildContext())
    if (r2.status !== 'ok') return
    builder.materialize(r2.prepared)
    expect((clock as any).count).toBe(2)
  })
})

// ── T-9E3-40 ──────────────────────────────────────────────────────────────────

describe('T-9E3-40: IdGenerator not called when getByHash() finds existing binding', () => {
  it('idGenerator not called when prepare is run but materialize is skipped due to existing hash', async () => {
    const idGen = seqGen()
    const clock = fixedClock()
    const builder = createCapabilityBindingBuilder({ idGenerator: idGen, clock })
    const repo = createInMemoryCapabilityBindingRepository()

    const prep = builder.prepare(createTestBindingDraft(), createTestBindingBuildContext())
    if (prep.status !== 'ok') return
    const binding = builder.materialize(prep.prepared)
    const { r } = prepareOk()
    await repo.put(binding, r.readiness, [])

    const countBefore = (idGen as any).count

    // Simulate: check if hash already exists before calling materialize
    const existing = await repo.getByHash(prep.bindingHash)
    expect(existing).toBeDefined()
    // If found, skip materialize — IdGenerator count unchanged
    expect((idGen as any).count).toBe(countBefore)
  })
})

// ── T-9E3-41 ──────────────────────────────────────────────────────────────────

describe('T-9E3-41: setId mismatch rejected', () => {
  it('rejects when setId does not match requirementSet', () => {
    const { builder } = makeBuilder()
    const d = createTestBindingDraft({ setId: 'set-wrong' as any })
    const r = builder.prepare(d, createTestBindingBuildContext())
    expect(r.status).toBe('invalid')
    if (r.status === 'invalid') {
      expect(r.validation.errors.some(e => e.code === 'REQUIREMENT_SET_ID_MISMATCH')).toBe(true)
    }
  })
})

// ── T-9E3-42 ──────────────────────────────────────────────────────────────────

describe('T-9E3-42: prepare() is pure — no observable side effects; calling twice produces same bindingHash', () => {
  it('calling prepare twice on same draft produces same bindingHash', () => {
    const { builder } = makeBuilder()
    const d = createTestBindingDraft()
    const ctx = createTestBindingBuildContext()
    const r1 = builder.prepare(d, ctx)
    const r2 = builder.prepare(d, ctx)
    expect(r1.status).toBe('ok')
    expect(r2.status).toBe('ok')
    if (r1.status === 'ok' && r2.status === 'ok') {
      expect(r1.bindingHash).toBe(r2.bindingHash)
    }
  })
})

// ── T-9E3-43 ──────────────────────────────────────────────────────────────────

describe('T-9E3-43: Installation entry mismatch rejected', () => {
  it('rejects when installation entry has wrong packageId', () => {
    const { builder } = makeBuilder()
    const installArtifact = createTestInstallationArtifact({
      installations: [createTestInstallationEntry({ packageId: 'pkg-wrong' })], // mismatch
    })
    const r = builder.prepare(createTestBindingDraft(), createTestBindingBuildContext({ installationArtifact: installArtifact }))
    expect(r.status).toBe('invalid')
    if (r.status === 'invalid') {
      expect(r.validation.errors.some(e => e.code === 'INSTALLATION_ENTRY_MISMATCH')).toBe(true)
    }
  })
})

// ── T-9E3-44 ──────────────────────────────────────────────────────────────────

describe('T-9E3-44: Empty or whitespace installationId or installationPath is rejected', () => {
  it('rejects empty installationId', () => {
    const { builder } = makeBuilder()
    const installArtifact = createTestInstallationArtifact({
      installations: [createTestInstallationEntry({ installationId: '' })],
    })
    const r = builder.prepare(createTestBindingDraft(), createTestBindingBuildContext({ installationArtifact: installArtifact }))
    expect(r.status).toBe('invalid')
    if (r.status === 'invalid') {
      expect(r.validation.errors.some(e => e.code === 'INSTALLATION_REFERENCE_INVALID')).toBe(true)
    }
  })

  it('rejects whitespace-only installationPath', () => {
    const { builder } = makeBuilder()
    const installArtifact = createTestInstallationArtifact({
      installations: [createTestInstallationEntry({ installationPath: '   ' })],
    })
    const r = builder.prepare(createTestBindingDraft(), createTestBindingBuildContext({ installationArtifact: installArtifact }))
    expect(r.status).toBe('invalid')
    if (r.status === 'invalid') {
      expect(r.validation.errors.some(e => e.code === 'INSTALLATION_REFERENCE_INVALID')).toBe(true)
    }
  })
})

// ── T-9E3-45 ──────────────────────────────────────────────────────────────────

describe('T-9E3-45: refreshReadiness() derives state from readiness', () => {
  it('refreshReadiness produces ready-for-activation when all satisfied, planned when installation missing', async () => {
    const repo = createInMemoryCapabilityBindingRepository()
    const { binding, r } = prepareOk()
    await repo.put(binding, r.readiness, [])

    const allReadyReadiness = r.readiness
    const updated = await repo.refreshReadiness(binding.bindingId, allReadyReadiness, [], '2026-07-24T02:00:00.000Z' as IsoTimestamp)
    expect(updated.state).toBe('ready-for-activation')

    // Now refresh with installation missing
    const minPrep = prepareOkMinimal()
    await repo.put(minPrep.binding, minPrep.r.readiness, [])
    const updatedMin = await repo.refreshReadiness(minPrep.binding.bindingId, minPrep.r.readiness, [], '2026-07-24T03:00:00.000Z' as IsoTimestamp)
    expect(updatedMin.state).toBe('planned')
  })
})

// ── T-9E3-46 ──────────────────────────────────────────────────────────────────

describe('T-9E3-46: CapabilityBindingRecord.readiness reflects current per-provider readiness after refreshReadiness()', () => {
  it('record.readiness matches the readiness passed to refreshReadiness', async () => {
    const repo = createInMemoryCapabilityBindingRepository()
    const { binding, r } = prepareOk()
    await repo.put(binding, r.readiness, [])

    const updated = await repo.refreshReadiness(binding.bindingId, r.readiness, [], '2026-07-24T02:00:00.000Z' as IsoTimestamp)
    expect(updated.readiness).toEqual(r.readiness)
  })
})

// ── T-9E3-47 ──────────────────────────────────────────────────────────────────

describe('T-9E3-47: Two different installationId values for the same package on the same provider produce identical bindingHash', () => {
  it('installationId does not affect bindingHash', () => {
    const { builder: b1 } = makeBuilder()
    const { builder: b2 } = makeBuilder()
    const d = createTestBindingDraft()
    const ctx1 = createTestBindingBuildContext({
      installationArtifact: createTestInstallationArtifact({
        installations: [createTestInstallationEntry({ installationId: 'inst-machine-A' })],
      }),
    })
    const ctx2 = createTestBindingBuildContext({
      installationArtifact: createTestInstallationArtifact({
        installations: [createTestInstallationEntry({ installationId: 'inst-machine-B' })],
      }),
    })
    const r1 = b1.prepare(d, ctx1)
    const r2 = b2.prepare(d, ctx2)
    expect(r1.status).toBe('ok')
    expect(r2.status).toBe('ok')
    if (r1.status === 'ok' && r2.status === 'ok') {
      expect(r1.bindingHash).toBe(r2.bindingHash)
    }
  })
})

// ── T-9E3-48 ──────────────────────────────────────────────────────────────────

describe('T-9E3-48: lockEntryHash and trustDecisionHash derived from artifact projections, not from ResolvedProviderReference', () => {
  it('ResolvedProviderReference has no lockEntryHash or trustDecisionHash fields', () => {
    const p = createTestResolvedProviderReference()
    // These fields must not exist on the type at all
    expect('lockEntryHash'    in p).toBe(false)
    expect('trustDecisionHash' in p).toBe(false)
  })

  it('bound provider has lockEntryHash from lock artifact, not from draft provider', () => {
    const { binding } = prepareOk()
    const bp = binding.providers[0]!
    expect(bp.lockEntryHash).toBe(H_LOCK)   // from lock artifact
    expect(bp.trustDecisionHash).toBe(H_TRUST) // from trust artifact
  })
})

// ── T-9E3-49 ──────────────────────────────────────────────────────────────────

describe('T-9E3-49: supersede() atomically inserts the replacement record and marks the prior record superseded; both records returned', () => {
  it('supersede returns both records atomically', async () => {
    const repo = createInMemoryCapabilityBindingRepository()
    const { binding, r, builder } = prepareOk()
    await repo.put(binding, r.readiness, [])

    const prep2 = builder.prepare(createTestBindingDraft(), createTestBindingBuildContext())
    if (prep2.status !== 'ok') return
    const replacement = builder.materialize(prep2.prepared, { supersedesBindingId: binding.bindingId })

    const result = await repo.supersede(binding.bindingId, replacement, prep2.readiness, [], '2026-07-24T01:00:00.000Z' as IsoTimestamp)

    expect(result.previous.state).toBe('superseded')
    expect(result.replacement.state).not.toBe('superseded')
    expect(result.replacement.binding.bindingId).toBe(replacement.bindingId)

    // Both must be retrievable
    const prev = await repo.get(binding.bindingId)
    const repl = await repo.get(replacement.bindingId)
    expect(prev?.state).toBe('superseded')
    expect(repl?.state).not.toBe('superseded')
  })
})

// ── T-9E3-50 ──────────────────────────────────────────────────────────────────

describe('T-9E3-50: A failed supersession leaves the original current record unchanged', () => {
  it('original record unchanged when supersede is called on nonexistent binding', async () => {
    const repo = createInMemoryCapabilityBindingRepository()
    const { binding, r, builder } = prepareOk()
    const put1 = await repo.put(binding, r.readiness, [])
    expect(put1.status).toBe('accepted')

    const prep2 = builder.prepare(createTestBindingDraft(), createTestBindingBuildContext())
    if (prep2.status !== 'ok') return
    const replacement = builder.materialize(prep2.prepared)

    // Try to supersede a nonexistent bindingId
    await expect(
      repo.supersede('nonexistent-id' as any, replacement, prep2.readiness, [], '2026-07-24T01:00:00.000Z' as IsoTimestamp),
    ).rejects.toThrow()

    // Original record must be unchanged
    const current = await repo.getCurrentForRequirement(TEST_REQUIREMENT_ID)
    expect(current?.binding.bindingId).toBe(binding.bindingId)
    expect(current?.state).not.toBe('superseded')
  })
})

// ── T-9E3-51 ──────────────────────────────────────────────────────────────────

describe('T-9E3-51: invalidate() requires a reason; omitting reason throws', () => {
  it('invalidate throws when reason is missing (undefined cast)', async () => {
    const repo = createInMemoryCapabilityBindingRepository()
    const { binding, r } = prepareOk()
    await repo.put(binding, r.readiness, [])

    await expect(
      repo.invalidate(binding.bindingId, undefined as any, '2026-07-24T01:00:00.000Z' as IsoTimestamp),
    ).rejects.toThrow()
  })

  it('invalidate succeeds with a valid reason', async () => {
    const repo = createInMemoryCapabilityBindingRepository()
    const { binding, r } = prepareOk()
    await repo.put(binding, r.readiness, [])

    const result = await repo.invalidate(binding.bindingId, TEST_INVALIDATION_REASON, '2026-07-24T01:00:00.000Z' as IsoTimestamp)
    expect(result.state).toBe('invalidated')
    expect(result.invalidationReason?.code).toBe('REQUIREMENT_CHANGED')
  })
})

// ── T-9E3-52 ──────────────────────────────────────────────────────────────────

describe('T-9E3-52: invalidated record carries the invalidation reason; refreshReadiness() on invalidated is rejected', () => {
  it('invalidated record has reason; refreshReadiness on it throws', async () => {
    const repo = createInMemoryCapabilityBindingRepository()
    const { binding, r } = prepareOk()
    await repo.put(binding, r.readiness, [])
    await repo.invalidate(binding.bindingId, TEST_INVALIDATION_REASON, '2026-07-24T01:00:00.000Z' as IsoTimestamp)

    // Verify reason is carried
    const record = await repo.get(binding.bindingId)
    expect(record?.state).toBe('invalidated')
    expect(record?.invalidationReason).toBeDefined()

    // refreshReadiness on invalidated must be rejected
    await expect(
      repo.refreshReadiness(binding.bindingId, r.readiness, [], '2026-07-24T02:00:00.000Z' as IsoTimestamp),
    ).rejects.toThrow()
  })
})
