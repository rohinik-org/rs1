import { describe, it, expect, beforeEach } from 'vitest'

import {
  buildNodeAdvertisement,
  validateAdvertisement,
  FederationService,
  type NodeAdvertisement,
  type AdvertisementId,
  type FederationId,
  type NodeId,
  type EpochId,
  type LeaseId,
  type ContentHash,
  type IsoTimestamp,
  type HashPort,
  type IdPort,
  type ClockPort,
  type CapabilityBindingRef,
  type TrustSnapshotRef,
  type NodeCapacity,
  type ReliabilityRef,
  type EconomicsRef,
  type NodeLocality,
  type NodeHealth,
  type AdvertisementRepository,
} from '../index.js'

// ── Deterministic test deps ───────────────────────────────────────────────────

const hashPort: HashPort = { hash: (v) => `sha256:${JSON.stringify(v)}` as ContentHash }
let idSeq = 0
const idPort: IdPort = { generate: () => `id-${++idSeq}` }
const clockPort: ClockPort = { monotonicNow: () => '2026-08-04T00:00:00.000Z' as IsoTimestamp }
const deps = { id: idPort, hash: hashPort, clock: clockPort }

beforeEach(() => { idSeq = 0 })

const fed = 'fed-1' as FederationId
const nodeA = 'node-A' as NodeId
const epochId = 'epoch-1' as EpochId
const leaseId = 'lease-1' as LeaseId

function makeAdArgs() {
  const capabilityRefs: CapabilityBindingRef[] = [
    { capabilityId: 'cap-read', bindingHash: 'sha256:cap-hash' as ContentHash },
  ]
  const trustSnapshotRef: TrustSnapshotRef = {
    snapshotId: 'snap-1',
    snapshotHash: 'sha256:snap-hash' as ContentHash,
  }
  const capacity: NodeCapacity = {
    availableCpu: 4,
    availableMemoryMb: 8192,
    maxConcurrency: 16,
  }
  const reliabilityRef: ReliabilityRef = {
    reliabilityId: 'rel-1',
    reliabilityHash: 'sha256:rel-hash' as ContentHash,
  }
  const economicsRef: EconomicsRef = {
    economicsId: 'econ-1',
    economicsHash: 'sha256:econ-hash' as ContentHash,
  }
  const locality: NodeLocality = {
    region: 'us-east',
    zone: 'us-east-1a',
    residencyZones: ['us-east', 'us-west'],
  }
  const health: NodeHealth = {
    status: 'HEALTHY',
    checkedAt: '2026-08-04T00:00:00.000Z' as IsoTimestamp,
  }
  return {
    nodeId: nodeA,
    federationId: fed,
    epochId,
    expiresAt: '2026-08-04T01:00:00.000Z' as IsoTimestamp,
    leaseId,
    capabilityRefs,
    trustSnapshotRef,
    capacity,
    reliabilityRef,
    economicsRef,
    locality,
    health,
  }
}

// ── buildNodeAdvertisement ────────────────────────────────────────────────────

describe('buildNodeAdvertisement', () => {
  it('produces a record with all required fields', () => {
    const ad = buildNodeAdvertisement(makeAdArgs(), deps)
    expect(ad.advertisementId).toMatch(/^id-/)
    expect(ad.nodeId).toBe(nodeA)
    expect(ad.federationId).toBe(fed)
    expect(ad.epochId).toBe(epochId)
    expect(ad.publishedAt).toBe('2026-08-04T00:00:00.000Z')
    expect(ad.expiresAt).toBe('2026-08-04T01:00:00.000Z')
    expect(ad.leaseId).toBe(leaseId)
    expect(ad.advertisementHash).toMatch(/^sha256:/)
    expect(ad.capabilityRefs).toHaveLength(1)
    expect(ad.trustSnapshotRef.snapshotId).toBe('snap-1')
    expect(ad.capacity.availableCpu).toBe(4)
    expect(ad.reliabilityRef.reliabilityId).toBe('rel-1')
    expect(ad.economicsRef.economicsId).toBe('econ-1')
    expect(ad.locality.region).toBe('us-east')
    expect(ad.health.status).toBe('HEALTHY')
  })

  it('advertisementHash is deterministic (same id seq → same hash)', () => {
    const args = makeAdArgs()
    const before = idSeq
    const a = buildNodeAdvertisement(args, deps)
    idSeq = before
    const b = buildNodeAdvertisement(args, deps)
    expect(a.advertisementHash).toBe(b.advertisementHash)
  })

  it('advertisementHash changes when nodeId changes', () => {
    const args1 = { ...makeAdArgs(), nodeId: 'node-A' as NodeId }
    const args2 = { ...makeAdArgs(), nodeId: 'node-B' as NodeId }
    const before = idSeq
    const a = buildNodeAdvertisement(args1, deps)
    idSeq = before
    const b = buildNodeAdvertisement(args2, deps)
    expect(a.advertisementHash).not.toBe(b.advertisementHash)
  })

  it('returns a frozen record', () => {
    const ad = buildNodeAdvertisement(makeAdArgs(), deps)
    expect(Object.isFrozen(ad)).toBe(true)
  })

  it('LAW-120/121: NodeAdvertisement has no raw policy fields (refs only)', () => {
    const ad = buildNodeAdvertisement(makeAdArgs(), deps)
    // Architecture test: advertisement must carry refs (hashes) not raw policy values
    expect(ad).not.toHaveProperty('policyRules')
    expect(ad).not.toHaveProperty('trustLevel')
    expect(ad).not.toHaveProperty('permissions')
    // trustSnapshotRef is a ref (has hash), not raw trust data
    expect(ad.trustSnapshotRef).toHaveProperty('snapshotHash')
    expect(ad.trustSnapshotRef).not.toHaveProperty('trustScore')
    expect(ad.trustSnapshotRef).not.toHaveProperty('trustValue')
  })
})

// ── validateAdvertisement ─────────────────────────────────────────────────────

describe('validateAdvertisement', () => {
  it('returns valid for correct input', () => {
    const ad = buildNodeAdvertisement(makeAdArgs(), deps)
    const result = validateAdvertisement(ad, epochId)
    expect(result.valid).toBe(true)
    expect(result.reason).toBeUndefined()
  })

  it('returns invalid when epochId mismatches', () => {
    const ad = buildNodeAdvertisement(makeAdArgs(), deps)
    const result = validateAdvertisement(ad, 'epoch-other' as EpochId)
    expect(result.valid).toBe(false)
    expect(result.reason).toBeDefined()
  })

  it('returns invalid when expiresAt <= publishedAt', () => {
    // expiresAt equal to publishedAt (clock always returns same stamp)
    const args = { ...makeAdArgs(), expiresAt: '2026-08-04T00:00:00.000Z' as IsoTimestamp }
    const ad = buildNodeAdvertisement(args, deps)
    const result = validateAdvertisement(ad, epochId)
    expect(result.valid).toBe(false)
    expect(result.reason).toBeDefined()
  })

  it('returns invalid when expiresAt is before publishedAt', () => {
    const args = { ...makeAdArgs(), expiresAt: '2026-08-03T00:00:00.000Z' as IsoTimestamp }
    const ad = buildNodeAdvertisement(args, deps)
    const result = validateAdvertisement(ad, epochId)
    expect(result.valid).toBe(false)
    expect(result.reason).toBeDefined()
  })
})

// ── AdvertisementRepository (type-level check) ────────────────────────────────

describe('AdvertisementRepository port', () => {
  it('is satisfied by an in-memory implementation', async () => {
    const store = new Map<NodeId, NodeAdvertisement>()
    const all: NodeAdvertisement[] = []

    const repo: AdvertisementRepository = {
      async save(ad) { store.set(ad.nodeId, ad); all.push(ad) },
      async findByNode(nodeId) { return store.get(nodeId) },
      async findByFederation(federationId) { return all.filter(a => a.federationId === federationId) },
      async expire(advertisementId) { /* noop in test */ void advertisementId },
    }

    const ad = buildNodeAdvertisement(makeAdArgs(), deps)
    await repo.save(ad)
    const found = await repo.findByNode(nodeA)
    expect(found?.advertisementId).toBe(ad.advertisementId)
    const fedAds = await repo.findByFederation(fed)
    expect(fedAds).toHaveLength(1)
  })
})

// ── FederationService.publishAdvertisement / getAdvertisement ─────────────────

function mkService(): FederationService {
  return new FederationService(
    { send: async () => {}, receive: async function* () {} },
    { attest: async () => ({ attestationId: 'att-1' as never, nodeId: nodeA, attestationHash: 'sha256:x' as never, attestedAt: '2026-08-04T00:00:00.000Z' as never }), verify: async () => true },
    { evaluate: async () => ({ admitted: true }) },
    { resolveTarget: async () => undefined },
    { getTrustSnapshot: async () => undefined },
    { open: async () => 'e' as never, record: async () => {}, seal: async () => {} },
    { leaderHint: async () => undefined },
    clockPort,
    idPort,
    hashPort,
  )
}

describe('FederationService advertisement', () => {
  it('publishAdvertisement stores; getAdvertisement retrieves by nodeId', () => {
    const svc = mkService()
    const ad = buildNodeAdvertisement(makeAdArgs(), deps)
    svc.publishAdvertisement(ad)
    const found = svc.getAdvertisement(nodeA)
    expect(found?.advertisementId).toBe(ad.advertisementId)
  })

  it('getAdvertisement returns undefined for unknown nodeId', () => {
    const svc = mkService()
    expect(svc.getAdvertisement('node-unknown' as NodeId)).toBeUndefined()
  })

  it('second publishAdvertisement overwrites the first for same nodeId', () => {
    const svc = mkService()
    const ad1 = buildNodeAdvertisement(makeAdArgs(), deps)
    const ad2 = buildNodeAdvertisement(makeAdArgs(), deps)
    svc.publishAdvertisement(ad1)
    svc.publishAdvertisement(ad2)
    const found = svc.getAdvertisement(nodeA)
    expect(found?.advertisementId).toBe(ad2.advertisementId)
  })

  it('NodeHealth status values cover HEALTHY, DEGRADED, UNAVAILABLE', () => {
    const statuses: NodeHealth['status'][] = ['HEALTHY', 'DEGRADED', 'UNAVAILABLE']
    for (const status of statuses) {
      const args = { ...makeAdArgs(), health: { status, checkedAt: '2026-08-04T00:00:00.000Z' as IsoTimestamp } }
      const ad = buildNodeAdvertisement(args, deps)
      expect(ad.health.status).toBe(status)
    }
  })
})
