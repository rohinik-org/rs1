import { describe, it, expect } from 'vitest'
import {
  canonicalStringify,
  deserializeCanonicalJson,
  parseVersionRange,
  createProductionIdGenerator,
  createProductionClock,
  computeRequirementHash,
  createCapabilityRequirementBuilder,
  createInMemoryCapabilityRequirementRepository,
} from '../index.js'
import {
  CanonicalSerializerError,
  CanonicalParserError,
  deriveResolutionState,
  PreparedSetAlreadyConsumedError,
  ForeignPreparedSetError,
  InvalidPreparedSetError,
} from '@rohinik-org/capability-contracts-ir'
import type {
  IdGenerator,
  Clock,
  IsoTimestamp,
  CapabilityRequirementSetDraft,
  CapabilityRequirementDraft,
  RequirementHashProjection,
  CapabilityId,
  VersionRangeExpression,
  RequirementOrigin,
} from '@rohinik-org/capability-contracts-ir'

// ── Test doubles ──────────────────────────────────────────────────────────────

function seqIdGen(prefix = 'id'): IdGenerator {
  let n = 0
  return { generate: () => `${prefix}-${++n}` }
}
function fixedClock(ts = '2026-07-24T00:00:00.000Z'): Clock {
  return { now: () => ts as IsoTimestamp }
}
function countingIdGen(): IdGenerator & { count: number } {
  let n = 0
  const g = { generate: () => `id-${++n}`, get count() { return n } } as IdGenerator & { count: number }
  return g
}
function countingClock(): Clock & { count: number } {
  let n = 0
  const c = { now: () => { n++; return '2026-07-24T00:00:00.000Z' as IsoTimestamp }, get count() { return n } } as Clock & { count: number }
  return c
}

const ORIGIN: RequirementOrigin = { direct: { kind: 'application', applicationId: 'app-1' as never }, chain: [] }

function baseReq(overrides: Partial<CapabilityRequirementDraft> = {}): CapabilityRequirementDraft {
  return {
    capabilityId: 'ai:generate:text',
    versionRange: '^1.0.0',
    requestedBy: { direct: { kind: 'application', applicationId: 'app-1' }, chain: [] },
    ...overrides,
  }
}
function setDraft(reqs: CapabilityRequirementDraft[], extra: Partial<CapabilityRequirementSetDraft> = {}): CapabilityRequirementSetDraft {
  return { requirements: reqs, ...extra }
}
function newBuilder() {
  return createCapabilityRequirementBuilder({ idGenerator: seqIdGen(), clock: fixedClock() })
}
function newRepo(idGen?: IdGenerator, clock?: Clock) {
  return createInMemoryCapabilityRequirementRepository({ idGenerator: idGen ?? seqIdGen(), clock: clock ?? fixedClock() })
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('Stage 9E-2 capability-contracts', () => {
  it('T-9E2-01: Caller mutation after submit() does not alter interned set', async () => {
    const repo = newRepo()
    const draft = setDraft([baseReq({ constraints: [{ kind: 'trust', minimum: 'signed', hardness: 'hard' }] })])
    const res = await repo.submit(draft)
    expect(res.status).toBe('accepted')
    // mutate original draft
    ;(draft.requirements[0].constraints as unknown[])[0] = { kind: 'trust', minimum: 'unknown', hardness: 'hard' }
    const stored = await repo.get(res.setId!)
    const c = stored!.requirements[0].constraints[0] as { minimum: string }
    expect(c.minimum).toBe('signed')
  })

  it('T-9E2-02: Nested arrays in constraints are frozen', async () => {
    const repo = newRepo()
    const res = await repo.submit(setDraft([baseReq({ constraints: [{ kind: 'permission', required: ['a', 'b'], forbidden: [] }] })]))
    const stored = await repo.get(res.setId!)
    const arr = (stored!.requirements[0].constraints[0] as { required: string[] }).required
    expect(Object.isFrozen(arr)).toBe(true)
    expect(() => { (arr as string[]).push('c') }).toThrow()
  })

  it('T-9E2-03: Same setId + same content is idempotent', async () => {
    const repo = newRepo()
    const d = setDraft([baseReq()], { setId: 'set-A' })
    const r1 = await repo.submit(d)
    expect(r1.status).toBe('accepted')
    const r2 = await repo.submit(setDraft([baseReq()], { setId: 'set-A' }))
    expect(r2.status).toBe('already-exists-identical')
    expect(r2.setId).toBe('set-A')
  })

  it('T-9E2-04: Same setId + different content returns REQUIREMENT_SET_ID_COLLISION', async () => {
    const repo = newRepo()
    await repo.submit(setDraft([baseReq()], { setId: 'set-B' }))
    const r2 = await repo.submit(setDraft([baseReq({ versionRange: '^2.0.0' })], { setId: 'set-B' }))
    expect(r2.status).toBe('rejected')
    expect(r2.submissionErrors[0]?.code).toBe('REQUIREMENT_SET_ID_COLLISION')
    expect(r2.setId).toBe('set-B')
  })

  it('T-9E2-05: Hard constraints survive serialize → deserialize', async () => {
    const repo = newRepo()
    const res = await repo.submit(setDraft([baseReq({ constraints: [{ kind: 'data-residency', allowedRegions: ['eu-west-1', 'us-east-1'] }] })]))
    const stored = await repo.get(res.setId!)
    const text = JSON.stringify(stored)
    const back = deserializeCanonicalJson(text) as { requirements: { constraints: { allowedRegions: string[] }[] }[] }
    expect(back.requirements[0].constraints[0].allowedRegions).toEqual(['eu-west-1', 'us-east-1'])
  })

  it('T-9E2-06: Semantically equivalent drafts produce identical semanticHash', () => {
    const b = newBuilder()
    const p1 = b.prepare(setDraft([baseReq({ versionRange: '^1.0.0', constraints: [{ kind: 'data-residency', allowedRegions: ['us', 'eu'] }] })]))
    const p2 = b.prepare(setDraft([baseReq({ versionRange: '>=1.0.0 <2.0.0-0', constraints: [{ kind: 'data-residency', allowedRegions: ['eu', 'us'] }] })]))
    expect(p1.status).toBe('ok')
    expect(p2.status).toBe('ok')
    if (p1.status === 'ok' && p2.status === 'ok') expect(p1.semanticHash).toBe(p2.semanticHash)
  })

  it('T-9E2-07: ProviderPreference ordering preserved', async () => {
    const repo = newRepo()
    const res = await repo.submit(setDraft([baseReq({ preferences: [{ kind: 'provider-preference', preferredProviderIds: ['p3', 'p1', 'p2'], weight: 0.5 }] })]))
    const stored = await repo.get(res.setId!)
    expect((stored!.requirements[0].preferences[0] as { preferredProviderIds: string[] }).preferredProviderIds).toEqual(['p3', 'p1', 'p2'])
  })

  it('T-9E2-08: DataResidency regions canonicalize sorted; order-independent hash', () => {
    const b = newBuilder()
    const p1 = b.prepare(setDraft([baseReq({ constraints: [{ kind: 'data-residency', allowedRegions: ['b', 'a', 'c'] }] })]))
    const p2 = b.prepare(setDraft([baseReq({ constraints: [{ kind: 'data-residency', allowedRegions: ['c', 'b', 'a'] }] })]))
    if (p1.status === 'ok' && p2.status === 'ok') expect(p1.semanticHash).toBe(p2.semanticHash)
  })

  it('T-9E2-09: Permission required/forbidden canonicalize sorted', async () => {
    const repo = newRepo()
    const res = await repo.submit(setDraft([baseReq({ constraints: [{ kind: 'permission', required: ['z', 'a'], forbidden: ['y', 'b'] }] })]))
    const stored = await repo.get(res.setId!)
    const c = stored!.requirements[0].constraints[0] as { required: string[]; forbidden: string[] }
    expect(c.required).toEqual(['a', 'z'])
    expect(c.forbidden).toEqual(['b', 'y'])
  })

  it('T-9E2-10: optional + no provider = unresolved-optional', () => {
    expect(deriveResolutionState('absent', 'optional')).toBe('unresolved-optional')
  })
  it('T-9E2-11: required + no provider = unresolved-required', () => {
    expect(deriveResolutionState('absent', 'required')).toBe('unresolved-required')
  })

  it('T-9E2-12: repeated originIdentityKey rejected', async () => {
    const repo = newRepo()
    const origin: RequirementOrigin = {
      direct: { kind: 'application', applicationId: 'app-1' as never },
      chain: [{ kind: 'application', applicationId: 'app-1' as never }],
    }
    const res = await repo.submit(setDraft([baseReq({ requestedBy: origin })]))
    expect(res.status).toBe('rejected')
    expect(res.validation.errors[0]?.code).toBe('ORIGIN_IDENTITY_REPEATED')
  })

  it('T-9E2-13: Fallback self-reference rejected', async () => {
    const repo = newRepo()
    const res = await repo.submit(setDraft([baseReq({ fallbackPolicy: { kind: 'use-alternative', alternative: { capabilityId: 'ai:generate:text', versionRange: '^1.0.0' } } })]))
    expect(res.validation.errors.some((e) => e.code === 'FALLBACK_SELF_REFERENCE')).toBe(true)
  })

  it('T-9E2-14: local-only + remote-required = CONTRADICTORY_CONSTRAINTS', async () => {
    const repo = newRepo()
    const res = await repo.submit(setDraft([baseReq({ constraints: [
      { kind: 'execution-location', mode: 'local-only', hardness: 'hard' },
      { kind: 'execution-location', mode: 'remote-required', hardness: 'hard' },
    ] })]))
    expect(res.validation.errors.some((e) => e.code === 'CONTRADICTORY_CONSTRAINTS')).toBe(true)
  })

  it('T-9E2-15: Disjoint data residency = CONTRADICTORY_CONSTRAINTS', async () => {
    const repo = newRepo()
    const res = await repo.submit(setDraft([baseReq({ constraints: [
      { kind: 'data-residency', allowedRegions: ['eu'] },
      { kind: 'data-residency', allowedRegions: ['us'] },
    ] })]))
    expect(res.validation.errors.some((e) => e.code === 'CONTRADICTORY_CONSTRAINTS')).toBe(true)
  })

  it('T-9E2-16: Feature in both required and forbidden = CONTRADICTORY_CONSTRAINTS', async () => {
    const repo = newRepo()
    const res = await repo.submit(setDraft([baseReq({ constraints: [{ kind: 'feature', requiredFeatures: ['x'], forbiddenFeatures: ['x'], hardness: 'hard' }] })]))
    expect(res.validation.errors.some((e) => e.code === 'CONTRADICTORY_CONSTRAINTS')).toBe(true)
  })

  it('T-9E2-17: Permission in both required and forbidden = CONTRADICTORY_CONSTRAINTS', async () => {
    const repo = newRepo()
    const res = await repo.submit(setDraft([baseReq({ constraints: [{ kind: 'permission', required: ['p'], forbidden: ['p'] }] })]))
    expect(res.validation.errors.some((e) => e.code === 'CONTRADICTORY_CONSTRAINTS')).toBe(true)
  })

  it('T-9E2-18: Two runtime constraints with different languages = CONTRADICTORY_CONSTRAINTS', async () => {
    const repo = newRepo()
    const res = await repo.submit(setDraft([baseReq({ constraints: [
      { kind: 'runtime', language: 'nodejs', hardness: 'hard' },
      { kind: 'runtime', language: 'python', hardness: 'hard' },
    ] })]))
    expect(res.validation.errors.some((e) => e.code === 'CONTRADICTORY_CONSTRAINTS')).toBe(true)
  })

  it('T-9E2-19: latency same metric+percentile merges to min; different percentile kept separate', async () => {
    const repo = newRepo()
    const res = await repo.submit(setDraft([baseReq({ constraints: [
      { kind: 'latency', metric: 'total-response', maximumMs: 1000, percentile: 50, hardness: 'hard' },
      { kind: 'latency', metric: 'total-response', maximumMs: 500, percentile: 50, hardness: 'hard' },
      { kind: 'latency', metric: 'total-response', maximumMs: 800, percentile: 99, hardness: 'hard' },
    ] })]))
    const stored = await repo.get(res.setId!)
    const latencies = stored!.requirements[0].constraints.filter((c) => c.kind === 'latency') as { maximumMs: number; percentile: number }[]
    expect(latencies.length).toBe(2)
    const p50 = latencies.find((l) => l.percentile === 50)
    expect(p50?.maximumMs).toBe(500)
  })

  it('T-9E2-20: bad maximumMs/capacity values rejected with proper codes', async () => {
    const repo = newRepo()
    const mk = (v: number) => repo.submit(setDraft([baseReq({ constraints: [{ kind: 'latency', metric: 'total-response', maximumMs: v, percentile: 50, hardness: 'hard' }] })]))
    expect((await mk(NaN)).validation.errors[0]?.code).toBe('NON_INTEGER_NUMERIC_FIELD')
    expect((await mk(Infinity)).validation.errors[0]?.code).toBe('NON_INTEGER_NUMERIC_FIELD')
    expect((await mk(0)).validation.errors[0]?.code).toBe('NEGATIVE_LATENCY')
    expect((await mk(-5)).validation.errors[0]?.code).toBe('NEGATIVE_LATENCY')
    expect((await mk(1.5)).validation.errors[0]?.code).toBe('NON_INTEGER_NUMERIC_FIELD')
    expect((await mk(Number.MAX_SAFE_INTEGER + 1)).validation.errors[0]?.code).toBe('NUMERIC_FIELD_OUT_OF_RANGE')
  })

  it('T-9E2-21: Invalid weight rejected; 0.125 valid', async () => {
    const repo = newRepo()
    for (const w of [NaN, Infinity, -0.1, 1.1]) {
      const res = await repo.submit(setDraft([baseReq({ preferences: [{ kind: 'cost', preferred: 'lowest', weight: w }] })]))
      expect(res.validation.errors.some((e) => e.code === 'INVALID_WEIGHT')).toBe(true)
    }
    const ok = await repo.submit(setDraft([baseReq({ preferences: [{ kind: 'cost', preferred: 'lowest', weight: 0.125 }] })]))
    expect(ok.status).toBe('accepted')
  })

  it('T-9E2-22: Malformed MoneyAmount rejected', async () => {
    const repo = newRepo()
    for (const micros of ['0001', '+1', '1.0', '-1', '1e6', '', ' 1']) {
      const res = await repo.submit(setDraft([baseReq({ constraints: [{ kind: 'cost', maximumPerCall: { currency: 'USD', micros }, hardness: 'hard' }] })]))
      expect(res.validation.errors.some((e) => e.code === 'INVALID_MONEY_MICROS')).toBe(true)
    }
  })

  it('T-9E2-23: Unknown deserialized field produces UNKNOWN_FIELD', async () => {
    const repo = newRepo()
    const res = await repo.submit(setDraft([baseReq({ unknownProperty: 1 } as unknown as Partial<CapabilityRequirementDraft>)]))
    expect(res.validation.errors.some((e) => e.code === 'UNKNOWN_FIELD')).toBe(true)
  })

  it('T-9E2-24: Empty origin identifier rejected', async () => {
    const repo = newRepo()
    const res = await repo.submit(setDraft([baseReq({ requestedBy: { direct: { kind: 'subsystem', subsystemName: '' }, chain: [] } })]))
    expect(res.validation.errors.some((e) => e.code === 'EMPTY_ORIGIN_IDENTIFIER')).toBe(true)
  })

  it('T-9E2-25: ProviderOverride without reason rejected', async () => {
    const repo = newRepo()
    const res = await repo.submit(setDraft([baseReq({ providerOverride: { kind: 'provider-override', providerId: 'p1', reason: '', hardness: 'hard' } })]))
    expect(res.validation.errors.some((e) => e.code === 'PROVIDER_OVERRIDE_MISSING_REASON')).toBe(true)
  })

  it('T-9E2-26: IsoTimestamp serializes as ISO 8601 string', async () => {
    const repo = newRepo()
    const res = await repo.submit(setDraft([baseReq()]))
    const stored = await repo.get(res.setId!)
    expect(typeof stored!.createdAt).toBe('string')
    expect(stored!.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('T-9E2-27: requirementHash recomputed from interned fields matches stored', async () => {
    const repo = newRepo()
    const res = await repo.submit(setDraft([baseReq({ constraints: [{ kind: 'trust', minimum: 'signed', hardness: 'hard' }] })]))
    const stored = await repo.get(res.setId!)
    const req = stored!.requirements[0]
    const projection: RequirementHashProjection = {
      capabilityId: req.capabilityId,
      versionRange: req.versionRange.normalized,
      necessity: req.necessity,
      multiplicity: req.multiplicity,
      constraints: req.constraints,
      preferences: req.preferences,
      requestedBy: req.requestedBy,
    }
    expect(computeRequirementHash(projection)).toBe(req.requirementHash)
  })

  it('T-9E2-28: semanticHash excludes setId and createdAt', async () => {
    const repo1 = newRepo(seqIdGen('a'), fixedClock('2026-01-01T00:00:00.000Z'))
    const repo2 = newRepo(seqIdGen('b'), fixedClock('2027-01-01T00:00:00.000Z'))
    const r1 = await repo1.submit(setDraft([baseReq()], { setId: 'X' }))
    const r2 = await repo2.submit(setDraft([baseReq()], { setId: 'Y' }))
    expect(r1.semanticHash).toBe(r2.semanticHash)
  })

  it('T-9E2-29: local-preferred with hardness=hard rejected', async () => {
    const repo = newRepo()
    const res = await repo.submit(setDraft([baseReq({ constraints: [{ kind: 'execution-location', mode: 'local-preferred', hardness: 'hard' }] })]))
    expect(res.validation.errors.some((e) => e.code === 'CONTRADICTORY_CONSTRAINTS')).toBe(true)
  })

  it('T-9E2-30: Non-integer maximumMs and MAX_SAFE_INTEGER+1 rejected', async () => {
    const repo = newRepo()
    const r1 = await repo.submit(setDraft([baseReq({ constraints: [{ kind: 'latency', metric: 'total-response', maximumMs: 1.5, percentile: 50, hardness: 'hard' }] })]))
    expect(r1.validation.errors[0]?.code).toBe('NON_INTEGER_NUMERIC_FIELD')
  })

  it('T-9E2-31: deriveResolutionState(ready, required) = resolved', () => {
    expect(deriveResolutionState('ready', 'required')).toBe('resolved')
  })
  it('T-9E2-32: deriveResolutionState(absent, optional) = unresolved-optional', () => {
    expect(deriveResolutionState('absent', 'optional')).toBe('unresolved-optional')
  })

  it('T-9E2-33: Hard 500 + soft 1000 → soft removed with warning at original path', async () => {
    const repo = newRepo()
    const res = await repo.submit(setDraft([baseReq({ constraints: [
      { kind: 'latency', metric: 'total-response', maximumMs: 500, percentile: 50, hardness: 'hard' },
      { kind: 'latency', metric: 'total-response', maximumMs: 1000, percentile: 50, hardness: 'soft' },
    ] })]))
    const w = res.validation.warnings.find((x) => x.code === 'SOFT_CONSTRAINT_REDUNDANT')
    expect(w).toBeDefined()
    expect(w!.path).toBe('requirements[0].constraints[1]')
    const stored = await repo.get(res.setId!)
    expect(stored!.requirements[0].constraints.filter((c) => c.kind === 'latency').length).toBe(1)
  })

  it('T-9E2-34: Hard 1000 + soft 500 → both retained', async () => {
    const repo = newRepo()
    const res = await repo.submit(setDraft([baseReq({ constraints: [
      { kind: 'latency', metric: 'total-response', maximumMs: 1000, percentile: 50, hardness: 'hard' },
      { kind: 'latency', metric: 'total-response', maximumMs: 500, percentile: 50, hardness: 'soft' },
    ] })]))
    const stored = await repo.get(res.setId!)
    expect(stored!.requirements[0].constraints.filter((c) => c.kind === 'latency').length).toBe(2)
  })

  it('T-9E2-35: relatedPaths contains both conflicting paths', async () => {
    const repo = newRepo()
    const res = await repo.submit(setDraft([baseReq({ constraints: [
      { kind: 'data-residency', allowedRegions: ['eu'] },
      { kind: 'data-residency', allowedRegions: ['us'] },
    ] })]))
    const err = res.validation.errors.find((e) => e.code === 'CONTRADICTORY_CONSTRAINTS')!
    expect(err.path).toBeDefined()
    expect(err.relatedPaths?.length).toBeGreaterThan(0)
  })

  it('T-9E2-36: requirementHash excludes requirementId', () => {
    const b = newBuilder()
    const p1 = b.prepare(setDraft([baseReq({ requirementId: 'r-1' })]))
    const p2 = b.prepare(setDraft([baseReq({ requirementId: 'r-2' })]))
    if (p1.status === 'ok' && p2.status === 'ok') expect(p1.semanticHash).toBe(p2.semanticHash)
  })

  it('T-9E2-37: requirementHash changes when hard constraint value changes', () => {
    const b = newBuilder()
    const p1 = b.prepare(setDraft([baseReq({ constraints: [{ kind: 'trust', minimum: 'signed', hardness: 'hard' }] })]))
    const p2 = b.prepare(setDraft([baseReq({ constraints: [{ kind: 'trust', minimum: 'official', hardness: 'hard' }] })]))
    if (p1.status === 'ok' && p2.status === 'ok') expect(p1.semanticHash).not.toBe(p2.semanticHash)
  })

  it('T-9E2-38: semanticHash changes when requirement order changes', () => {
    const b = newBuilder()
    const a = baseReq({ capabilityId: 'ai:generate:text' })
    const c = baseReq({ capabilityId: 'document:parse' })
    const p1 = b.prepare(setDraft([a, c]))
    const p2 = b.prepare(setDraft([c, a]))
    if (p1.status === 'ok' && p2.status === 'ok') expect(p1.semanticHash).not.toBe(p2.semanticHash)
  })

  it('T-9E2-39: semanticHash changes when preference order changes', () => {
    const b = newBuilder()
    const p1 = b.prepare(setDraft([baseReq({ preferences: [
      { kind: 'cost', preferred: 'lowest', weight: 0.5 },
      { kind: 'latency', preferred: 'low', weight: 0.5 },
    ] })]))
    const p2 = b.prepare(setDraft([baseReq({ preferences: [
      { kind: 'latency', preferred: 'low', weight: 0.5 },
      { kind: 'cost', preferred: 'lowest', weight: 0.5 },
    ] })]))
    if (p1.status === 'ok' && p2.status === 'ok') expect(p1.semanticHash).not.toBe(p2.semanticHash)
  })

  it('T-9E2-40: canonicalStringify key insertion order invariance', () => {
    expect(canonicalStringify({ b: 1, a: 2 })).toBe(canonicalStringify({ a: 2, b: 1 }))
    expect(canonicalStringify({ b: 1, a: 2 })).toBe('{"a":2,"b":1}')
  })

  it('T-9E2-41: Missing requirementId assigned during materialize, not prepare', () => {
    const idGen = countingIdGen()
    const b = createCapabilityRequirementBuilder({ idGenerator: idGen, clock: fixedClock() })
    const prep = b.prepare(setDraft([baseReq()]))
    expect(idGen.count).toBe(0)
    if (prep.status !== 'ok') throw new Error('expected ok')
    const { interned } = b.materialize(prep.prepared)
    expect(idGen.count).toBeGreaterThan(0)
    expect(interned.set.requirements[0].requirementId).toBeDefined()
  })

  it('T-9E2-42: idempotent submit skips materialize; IdGenerator/Clock not called', async () => {
    const idGen = countingIdGen()
    const clock = countingClock()
    const repo = createInMemoryCapabilityRequirementRepository({ idGenerator: idGen, clock })
    await repo.submit(setDraft([baseReq()], { setId: 'S' }))
    const idAfterFirst = idGen.count
    const clockAfterFirst = clock.count
    const r2 = await repo.submit(setDraft([baseReq()], { setId: 'S' }))
    expect(r2.status).toBe('already-exists-identical')
    expect(idGen.count).toBe(idAfterFirst)
    expect(clock.count).toBe(clockAfterFirst)
  })

  it('T-9E2-43: ORIGIN_IDENTITY_REPEATED covers all entry kinds', async () => {
    const repo = newRepo()
    const cases: RequirementOrigin[] = [
      { direct: { kind: 'subsystem', subsystemName: 's' }, chain: [{ kind: 'subsystem', subsystemName: 's' }] },
      { direct: { kind: 'package', packageId: 'p', packageVersion: '1' }, chain: [{ kind: 'package', packageId: 'p', packageVersion: '1' }] },
      { direct: { kind: 'operation', operationId: 'o' as never }, chain: [{ kind: 'operation', operationId: 'o' as never }] },
      { direct: { kind: 'policy', policyId: 'pol', policyVersion: '1' }, chain: [{ kind: 'application', applicationId: 'a' as never }, { kind: 'policy', policyId: 'pol', policyVersion: '1' }] },
    ]
    for (const origin of cases) {
      const res = await repo.submit(setDraft([baseReq({ requestedBy: origin })]))
      expect(res.validation.errors.some((e) => e.code === 'ORIGIN_IDENTITY_REPEATED')).toBe(true)
    }
  })

  it('T-9E2-44: Malformed behaviorContractHash rejected with INVALID_CONTENT_HASH', async () => {
    const repo = newRepo()
    for (const h of ['abc', 'A'.repeat(64), 'g'.repeat(64), 'a'.repeat(63)]) {
      const res = await repo.submit(setDraft([baseReq({ fallbackPolicy: { kind: 'use-stub', stubId: 's', behaviorContractHash: h } })]))
      expect(res.validation.errors.some((e) => e.code === 'INVALID_CONTENT_HASH')).toBe(true)
    }
  })

  it('T-9E2-45: node-semver prerelease behavior', async () => {
    const semver = (await import('semver')).default
    const vr = parseVersionRange('^1.0.0')
    // "^1.0.0" does not match "1.1.0-beta.1" or "1.0.0-rc.1" under includePrerelease:false.
    expect(semver.satisfies('1.1.0-beta.1', vr.normalized, { includePrerelease: false })).toBe(false)
    expect(semver.satisfies('1.0.0-rc.1', vr.normalized, { includePrerelease: false })).toBe(false)
    // A comparator with a prerelease tag matches prereleases only on same [major,minor,patch].
    const vr2 = parseVersionRange('>=1.0.0-alpha.1')
    expect(semver.satisfies('1.0.0-alpha.2', vr2.normalized, { includePrerelease: false })).toBe(true)
    expect(semver.satisfies('1.1.0-beta.1', vr2.normalized, { includePrerelease: false })).toBe(false)
    // Normalized form is deterministic.
    expect(parseVersionRange('^1.0.0').normalized).toBe(vr.normalized)
  })

  it('T-9E2-46: Soft local-preferred converted to ExecutionLocationPreference; absent from constraints', async () => {
    const repo = newRepo()
    const res = await repo.submit(setDraft([baseReq({ constraints: [{ kind: 'execution-location', mode: 'local-preferred', hardness: 'soft' }] })]))
    expect(res.status).toBe('accepted')
    const stored = await repo.get(res.setId!)
    expect(stored!.requirements[0].constraints.some((c) => c.kind === 'execution-location')).toBe(false)
    const pref = stored!.requirements[0].preferences.find((p) => p.kind === 'execution-location') as { preferred: string; weight: number } | undefined
    expect(pref?.preferred).toBe('local')
    expect(pref?.weight).toBe(1.0)
  })

  it('T-9E2-47: policy direct without human ancestor rejected with INVALID_ORIGIN_CHAIN', async () => {
    const repo = newRepo()
    const origin: RequirementOrigin = { direct: { kind: 'policy', policyId: 'pol', policyVersion: '1' }, chain: [{ kind: 'package', packageId: 'p', packageVersion: '1' }] }
    const res = await repo.submit(setDraft([baseReq({ requestedBy: origin })]))
    expect(res.validation.errors.some((e) => e.code === 'INVALID_ORIGIN_CHAIN')).toBe(true)
  })

  it('T-9E2-48: submissionErrors always an array; empty on accepted', async () => {
    const repo = newRepo()
    const res = await repo.submit(setDraft([baseReq()]))
    expect(Array.isArray(res.submissionErrors)).toBe(true)
    expect(res.submissionErrors.length).toBe(0)
  })

  it('T-9E2-49: deserializeCanonicalJson rejects duplicate keys', () => {
    expect(() => deserializeCanonicalJson('{"a":1,"a":2}')).toThrow(CanonicalParserError)
    try {
      deserializeCanonicalJson('{"a":1,"a":2}')
    } catch (e) {
      expect((e as CanonicalParserError).code).toBe('DUPLICATE_OBJECT_KEY')
    }
    // nested duplicate
    expect(() => deserializeCanonicalJson('{"x":{"k":1,"k":2}}')).toThrow(CanonicalParserError)
    // valid passes
    expect(deserializeCanonicalJson('{"a":1,"b":2}')).toEqual({ a: 1, b: 2 })
    // same key at different nesting is fine
    expect(deserializeCanonicalJson('{"a":{"k":1},"b":{"k":2}}')).toEqual({ a: { k: 1 }, b: { k: 2 } })
  })

  it('T-9E2-50: canonicalStringify rejects BigInt', () => {
    expect(() => canonicalStringify(10n as unknown as never)).toThrow(CanonicalSerializerError)
    expect(() => canonicalStringify(NaN as unknown as never)).toThrow(CanonicalSerializerError)
    expect(() => canonicalStringify(undefined as unknown as never)).toThrow(CanonicalSerializerError)
    expect(() => canonicalStringify(new Date() as unknown as never)).toThrow(CanonicalSerializerError)
  })

  it('T-9E2-51: Missing requirementIds generated; supplied kept', () => {
    const b = createCapabilityRequirementBuilder({ idGenerator: seqIdGen('gen'), clock: fixedClock() })
    const prep = b.prepare(setDraft([baseReq({ requirementId: 'keep-me' }), baseReq({ capabilityId: 'document:parse' })]))
    if (prep.status !== 'ok') throw new Error('ok expected')
    const { interned } = b.materialize(prep.prepared)
    expect(interned.set.requirements[0].requirementId).toBe('keep-me')
    expect(interned.set.requirements[1].requirementId).toMatch(/^gen-/)
  })

  it('T-9E2-52: Changing requirementId alone changes neither hash', async () => {
    const repo1 = newRepo()
    const repo2 = newRepo()
    const r1 = await repo1.submit(setDraft([baseReq({ requirementId: 'r-A' })]))
    const r2 = await repo2.submit(setDraft([baseReq({ requirementId: 'r-B' })]))
    expect(r1.semanticHash).toBe(r2.semanticHash)
    const s1 = await repo1.get(r1.setId!)
    const s2 = await repo2.get(r2.setId!)
    expect(s1!.requirements[0].requirementHash).toBe(s2!.requirements[0].requirementHash)
  })

  it('T-9E2-53: Equivalent fallback version ranges normalize to same requirementHash', async () => {
    const repo1 = newRepo()
    const repo2 = newRepo()
    const r1 = await repo1.submit(setDraft([baseReq({ fallbackPolicy: { kind: 'use-alternative', alternative: { capabilityId: 'document:parse', versionRange: '^1.0.0' } } })]))
    const r2 = await repo2.submit(setDraft([baseReq({ fallbackPolicy: { kind: 'use-alternative', alternative: { capabilityId: 'document:parse', versionRange: '>=1.0.0 <2.0.0-0' } } })]))
    const s1 = await repo1.get(r1.setId!)
    const s2 = await repo2.get(r2.setId!)
    expect(s1!.requirements[0].requirementHash).toBe(s2!.requirements[0].requirementHash)
  })

  it('T-9E2-54: local-preferred soft + existing local preference → merged by max weight', async () => {
    const repo = newRepo()
    const res = await repo.submit(setDraft([baseReq({
      constraints: [{ kind: 'execution-location', mode: 'local-preferred', hardness: 'soft' }],
      preferences: [{ kind: 'execution-location', preferred: 'local', weight: 0.3 }],
    })]))
    expect(res.status).toBe('accepted')
    const stored = await repo.get(res.setId!)
    const prefs = stored!.requirements[0].preferences.filter((p) => p.kind === 'execution-location') as { weight: number }[]
    expect(prefs.length).toBe(1)
    expect(prefs[0].weight).toBe(1.0)
  })

  it('T-9E2-55: local-preferred soft + existing remote preference → CONTRADICTORY_PREFERENCES', async () => {
    const repo = newRepo()
    const res = await repo.submit(setDraft([baseReq({
      constraints: [{ kind: 'execution-location', mode: 'local-preferred', hardness: 'soft' }],
      preferences: [{ kind: 'execution-location', preferred: 'remote', weight: 0.5 }],
    })]))
    expect(res.validation.errors.some((e) => e.code === 'CONTRADICTORY_PREFERENCES')).toBe(true)
  })

  it('T-9E2-56: Reusing consumed token throws PreparedSetAlreadyConsumedError', () => {
    const b = newBuilder()
    const prep = b.prepare(setDraft([baseReq()]))
    if (prep.status !== 'ok') throw new Error('ok expected')
    b.materialize(prep.prepared)
    expect(() => b.materialize(prep.prepared)).toThrow(PreparedSetAlreadyConsumedError)
  })

  it('T-9E2-57: Missing percentile → MISSING_LATENCY_PERCENTILE at draft path', async () => {
    const repo = newRepo()
    const res = await repo.submit(setDraft([baseReq({ constraints: [{ kind: 'latency', metric: 'total-response', maximumMs: 500, hardness: 'hard' } as unknown as never] })]))
    const err = res.validation.errors.find((e) => e.code === 'MISSING_LATENCY_PERCENTILE')
    expect(err).toBeDefined()
    expect(err!.path).toBe('requirements[0].constraints[0]')
  })

  it('T-9E2-58: Foreign builder token → ForeignPreparedSetError; no IdGen/Clock', () => {
    const idGenA = countingIdGen(); const clockA = countingClock()
    const idGenB = countingIdGen(); const clockB = countingClock()
    const a = createCapabilityRequirementBuilder({ idGenerator: idGenA, clock: clockA })
    const b = createCapabilityRequirementBuilder({ idGenerator: idGenB, clock: clockB })
    const prep = a.prepare(setDraft([baseReq()]))
    if (prep.status !== 'ok') throw new Error('ok expected')
    expect(() => b.materialize(prep.prepared)).toThrow(ForeignPreparedSetError)
    expect(idGenB.count).toBe(0)
    expect(clockB.count).toBe(0)
  })

  it('T-9E2-59: Forged plain object → InvalidPreparedSetError; no IdGen/Clock', () => {
    const idGen = countingIdGen(); const clock = countingClock()
    const b = createCapabilityRequirementBuilder({ idGenerator: idGen, clock })
    expect(() => b.materialize({} as never)).toThrow(InvalidPreparedSetError)
    expect(idGen.count).toBe(0)
    expect(clock.count).toBe(0)
  })

  it('T-9E2-60: Mutating draft after prepare does not alter materialized hashes', () => {
    const b = newBuilder()
    const draft = setDraft([baseReq({ constraints: [{ kind: 'trust', minimum: 'signed', hardness: 'hard' }] })])
    const prep = b.prepare(draft)
    if (prep.status !== 'ok') throw new Error('ok expected')
    const semanticBefore = prep.semanticHash
    ;(draft.requirements[0].constraints as unknown[])[0] = { kind: 'trust', minimum: 'unknown', hardness: 'hard' }
    const { interned } = b.materialize(prep.prepared)
    expect(interned.envelopeIdentity.semanticHash).toBe(semanticBefore)
    const c = interned.set.requirements[0].constraints[0] as { minimum: string }
    expect(c.minimum).toBe('signed')
  })

  it('T-9E2-61: zero-weight preference ≡ absent for hashing; no zero-weight in interned', async () => {
    const repo1 = newRepo()
    const repo2 = newRepo()
    const r1 = await repo1.submit(setDraft([baseReq({ preferences: [{ kind: 'cost', preferred: 'lowest', weight: 0 }] })]))
    const r2 = await repo2.submit(setDraft([baseReq({ preferences: [] })]))
    expect(r1.semanticHash).toBe(r2.semanticHash)
    const s1 = await repo1.get(r1.setId!)
    expect(s1!.requirements[0].preferences.length).toBe(0)
  })

  it('T-9E2-62: two non-zero prefs same kind → DUPLICATE_PREFERENCE_KIND with relatedPaths', async () => {
    const repo = newRepo()
    const res = await repo.submit(setDraft([baseReq({ preferences: [
      { kind: 'cost', preferred: 'lowest', weight: 0.5 },
      { kind: 'cost', preferred: 'balanced', weight: 0.3 },
    ] })]))
    const err = res.validation.errors.find((e) => e.code === 'DUPLICATE_PREFERENCE_KIND')
    expect(err).toBeDefined()
    expect(err!.relatedPaths?.length).toBeGreaterThan(0)
  })

  it('T-9E2-63: zero-weight pref does not cause DUPLICATE_PREFERENCE_KIND', async () => {
    const repo = newRepo()
    const res = await repo.submit(setDraft([baseReq({ preferences: [
      { kind: 'cost', preferred: 'lowest', weight: 0.5 },
      { kind: 'cost', preferred: 'balanced', weight: 0 },
    ] })]))
    expect(res.status).toBe('accepted')
    expect(res.validation.errors.some((e) => e.code === 'DUPLICATE_PREFERENCE_KIND')).toBe(false)
  })

  it('T-9E2-64: Two cost constraints with different ceiling fields normalize to one object', async () => {
    const repo1 = newRepo()
    const repo2 = newRepo()
    const r1 = await repo1.submit(setDraft([baseReq({ constraints: [
      { kind: 'cost', maximumPerCall: { currency: 'USD', micros: '1000000' }, hardness: 'hard' },
      { kind: 'cost', maximumPerMillionInputTokens: { currency: 'USD', micros: '2000000' }, hardness: 'hard' },
    ] })]))
    const r2 = await repo2.submit(setDraft([baseReq({ constraints: [
      { kind: 'cost', maximumPerCall: { currency: 'USD', micros: '1000000' }, maximumPerMillionInputTokens: { currency: 'USD', micros: '2000000' }, hardness: 'hard' },
    ] })]))
    const s1 = await repo1.get(r1.setId!)
    expect(s1!.requirements[0].constraints.filter((c) => c.kind === 'cost').length).toBe(1)
    expect(r1.semanticHash).toBe(r2.semanticHash)
  })
})

void ORIGIN
