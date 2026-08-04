import { describe, it, expect, beforeEach } from 'vitest'

import {
  buildFederationManifest,
  buildFederationEpoch,
  buildMembershipSnapshot,
  buildTopologyEdge,
  buildMembershipProposal,
  buildMembershipDecision,
  FederationService,
  FederationError,
  type FederationId,
  type NodeId,
  type EpochId,
  type ContentHash,
  type IsoTimestamp,
  type HashPort,
  type IdPort,
  type ClockPort,
  type FederationManifest,
  type FederationEpoch,
  type MemberEntry,
  type DecisionId,
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
const nodeB = 'node-B' as NodeId
const epochId = 'epoch-1' as EpochId
const decisionId = 'decision-1' as DecisionId

function coordinatorEntry(nodeId: NodeId): MemberEntry {
  return {
    nodeId,
    admissionDecisionId: decisionId,
    role: 'COORDINATOR',
    joinedAt: '2026-08-04T00:00:00.000Z' as IsoTimestamp,
    consistencyClasses: ['STRONG_CONTROL'],
  }
}

function workerEntry(nodeId: NodeId): MemberEntry {
  return {
    nodeId,
    admissionDecisionId: decisionId,
    role: 'WORKER',
    joinedAt: '2026-08-04T00:00:00.000Z' as IsoTimestamp,
    consistencyClasses: ['CAUSAL_EVIDENCE'],
  }
}

// ── FederationManifest ────────────────────────────────────────────────────────

describe('buildFederationManifest', () => {
  it('produces a record with all required fields and manifestHash', () => {
    const manifest = buildFederationManifest(
      { federationId: fed, name: 'My Fed', trustDomain: 'td-1', tenantId: 'tenant-1' },
      deps,
    )
    expect(manifest.federationId).toBe(fed)
    expect(manifest.name).toBe('My Fed')
    expect(manifest.trustDomain).toBe('td-1')
    expect(manifest.tenantId).toBe('tenant-1')
    expect(manifest.formedAt).toBe('2026-08-04T00:00:00.000Z')
    expect(manifest.manifestHash).toMatch(/^sha256:/)
  })

  it('manifestHash is deterministic (same input → same hash)', () => {
    const args = { federationId: fed, name: 'My Fed', trustDomain: 'td-1', tenantId: 'tenant-1' } as const
    expect(buildFederationManifest(args, deps).manifestHash)
      .toBe(buildFederationManifest(args, deps).manifestHash)
  })

  it('manifestHash changes when name changes', () => {
    const a = buildFederationManifest({ federationId: fed, name: 'Alpha', trustDomain: 'td-1', tenantId: 'tenant-1' }, deps)
    const b = buildFederationManifest({ federationId: fed, name: 'Beta', trustDomain: 'td-1', tenantId: 'tenant-1' }, deps)
    expect(a.manifestHash).not.toBe(b.manifestHash)
  })

  it('returns frozen record', () => {
    const manifest = buildFederationManifest(
      { federationId: fed, name: 'My Fed', trustDomain: 'td-1', tenantId: 'tenant-1' },
      deps,
    )
    expect(Object.isFrozen(manifest)).toBe(true)
  })
})

// ── FederationEpoch ───────────────────────────────────────────────────────────

describe('buildFederationEpoch', () => {
  it('produces a record with all required fields and epochHash', () => {
    const epoch = buildFederationEpoch(
      { federationId: fed, epochNumber: 1, memberCount: 2 },
      deps,
    )
    expect(epoch.federationId).toBe(fed)
    expect(epoch.epochNumber).toBe(1)
    expect(epoch.memberCount).toBe(2)
    expect(epoch.epochId).toMatch(/^id-/)
    expect(epoch.formedAt).toBe('2026-08-04T00:00:00.000Z')
    expect(epoch.epochHash).toMatch(/^sha256:/)
    expect(epoch.previousEpochId).toBeUndefined()
  })

  it('carries previousEpochId when provided', () => {
    const epoch = buildFederationEpoch(
      { federationId: fed, epochNumber: 2, memberCount: 3, previousEpochId: epochId, previousEpochNumber: 1 },
      deps,
    )
    expect(epoch.previousEpochId).toBe(epochId)
    expect(epoch.epochNumber).toBe(2)
  })

  it('epochHash changes when memberCount changes', () => {
    const a = buildFederationEpoch({ federationId: fed, epochNumber: 1, memberCount: 2 }, deps)
    const b = buildFederationEpoch({ federationId: fed, epochNumber: 1, memberCount: 5 }, deps)
    expect(a.epochHash).not.toBe(b.epochHash)
  })

  it('returns frozen record', () => {
    const epoch = buildFederationEpoch({ federationId: fed, epochNumber: 1, memberCount: 1 }, deps)
    expect(Object.isFrozen(epoch)).toBe(true)
  })

  it('LAW-127: epochNumber must be > 0 (throws on 0)', () => {
    expect(() => buildFederationEpoch({ federationId: fed, epochNumber: 0, memberCount: 1 }, deps))
      .toThrow(FederationError)
  })

  it('LAW-127: epochNumber must be > 0 (throws on negative)', () => {
    expect(() => buildFederationEpoch({ federationId: fed, epochNumber: -1, memberCount: 1 }, deps))
      .toThrow(FederationError)
  })

  it('LAW-127: epochNumber must advance by 1 from previousEpochNumber (throws if not consecutive)', () => {
    expect(() =>
      buildFederationEpoch(
        { federationId: fed, epochNumber: 3, memberCount: 1, previousEpochId: epochId, previousEpochNumber: 1 },
        deps,
      ),
    ).toThrow(FederationError)
  })

  it('LAW-127: epochNumber must advance by 1 (throws on same number)', () => {
    expect(() =>
      buildFederationEpoch(
        { federationId: fed, epochNumber: 1, memberCount: 1, previousEpochId: epochId, previousEpochNumber: 1 },
        deps,
      ),
    ).toThrow(FederationError)
  })

  it('LAW-127: valid advance (previousEpochNumber + 1) succeeds', () => {
    const epoch = buildFederationEpoch(
      { federationId: fed, epochNumber: 3, memberCount: 2, previousEpochId: epochId, previousEpochNumber: 2 },
      deps,
    )
    expect(epoch.epochNumber).toBe(3)
  })
})

// ── MembershipSnapshot ────────────────────────────────────────────────────────

describe('buildMembershipSnapshot', () => {
  it('produces a valid snapshot with coordinator', () => {
    const snap = buildMembershipSnapshot(
      { federationId: fed, epochId, memberEntries: [coordinatorEntry(nodeA), workerEntry(nodeB)] },
      deps,
    )
    expect(snap.federationId).toBe(fed)
    expect(snap.epochId).toBe(epochId)
    expect(snap.snapshotId).toMatch(/^id-/)
    expect(snap.capturedAt).toBe('2026-08-04T00:00:00.000Z')
    expect(snap.memberEntries).toHaveLength(2)
    expect(snap.snapshotHash).toMatch(/^sha256:/)
  })

  it('returns frozen record', () => {
    const snap = buildMembershipSnapshot(
      { federationId: fed, epochId, memberEntries: [coordinatorEntry(nodeA)] },
      deps,
    )
    expect(Object.isFrozen(snap)).toBe(true)
  })

  it('LAW-129: throws FEDERATION_SPLIT_BRAIN_BLOCKED when no coordinator', () => {
    expect(() =>
      buildMembershipSnapshot(
        { federationId: fed, epochId, memberEntries: [workerEntry(nodeA), workerEntry(nodeB)] },
        deps,
      ),
    ).toThrow(FederationError)
  })

  it('LAW-129: error code is FEDERATION_SPLIT_BRAIN_BLOCKED', () => {
    try {
      buildMembershipSnapshot(
        { federationId: fed, epochId, memberEntries: [workerEntry(nodeA)] },
        deps,
      )
      expect.fail('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(FederationError)
      expect((err as FederationError).code).toBe('FEDERATION_SPLIT_BRAIN_BLOCKED')
    }
  })

  it('LAW-129: empty memberEntries also throws', () => {
    expect(() =>
      buildMembershipSnapshot({ federationId: fed, epochId, memberEntries: [] }, deps),
    ).toThrow(FederationError)
  })
})

// ── TopologyEdge ──────────────────────────────────────────────────────────────

describe('buildTopologyEdge', () => {
  it('produces a record with all required fields and edgeHash', () => {
    const edge = buildTopologyEdge(
      { federationId: fed, epochId, sourceNodeId: nodeA, targetNodeId: nodeB },
      deps,
    )
    expect(edge.federationId).toBe(fed)
    expect(edge.epochId).toBe(epochId)
    expect(edge.sourceNodeId).toBe(nodeA)
    expect(edge.targetNodeId).toBe(nodeB)
    expect(edge.edgeId).toMatch(/^id-/)
    expect(edge.edgeHash).toMatch(/^sha256:/)
  })

  it('returns frozen record', () => {
    const edge = buildTopologyEdge(
      { federationId: fed, epochId, sourceNodeId: nodeA, targetNodeId: nodeB },
      deps,
    )
    expect(Object.isFrozen(edge)).toBe(true)
  })

  it('edgeHash changes when direction reverses', () => {
    const a = buildTopologyEdge({ federationId: fed, epochId, sourceNodeId: nodeA, targetNodeId: nodeB }, deps)
    const b = buildTopologyEdge({ federationId: fed, epochId, sourceNodeId: nodeB, targetNodeId: nodeA }, deps)
    expect(a.edgeHash).not.toBe(b.edgeHash)
  })
})

// ── TopologyZone ──────────────────────────────────────────────────────────────

describe('buildTopologyZone', () => {
  it('produces a record with zoneId, nodeIds, and zoneHash', async () => {
    const { buildTopologyZone } = await import('../index.js')
    const zone = buildTopologyZone({ federationId: fed, nodeIds: [nodeA, nodeB] }, deps)
    expect(zone.federationId).toBe(fed)
    expect(zone.nodeIds).toEqual([nodeA, nodeB])
    expect(zone.zoneId).toMatch(/^id-/)
    expect(zone.zoneHash).toMatch(/^sha256:/)
  })
})

// ── MembershipProposal ────────────────────────────────────────────────────────

describe('buildMembershipProposal', () => {
  it('produces a proposal record with all required fields and proposalHash', () => {
    const proposal = buildMembershipProposal(
      { federationId: fed, epochId, kind: 'JOIN', targetNodeId: nodeA },
      deps,
    )
    expect(proposal.federationId).toBe(fed)
    expect(proposal.epochId).toBe(epochId)
    expect(proposal.kind).toBe('JOIN')
    expect(proposal.targetNodeId).toBe(nodeA)
    expect(proposal.proposalId).toMatch(/^id-/)
    expect(proposal.proposedAt).toBe('2026-08-04T00:00:00.000Z')
    expect(proposal.proposalHash).toMatch(/^sha256:/)
  })

  it('supports all MembershipChangeKind values', () => {
    const kinds = ['JOIN', 'DRAIN', 'REMOVE', 'REVOKE'] as const
    for (const kind of kinds) {
      const p = buildMembershipProposal({ federationId: fed, epochId, kind, targetNodeId: nodeA }, deps)
      expect(p.kind).toBe(kind)
    }
  })

  it('returns frozen record', () => {
    const p = buildMembershipProposal({ federationId: fed, epochId, kind: 'JOIN', targetNodeId: nodeA }, deps)
    expect(Object.isFrozen(p)).toBe(true)
  })
})

// ── MembershipDecision ────────────────────────────────────────────────────────

describe('buildMembershipDecision', () => {
  it('ACCEPTED decision carries all required fields', () => {
    const proposal = buildMembershipProposal(
      { federationId: fed, epochId, kind: 'JOIN', targetNodeId: nodeA },
      deps,
    )
    const decision = buildMembershipDecision(proposal, 'ACCEPTED', deps)
    expect(decision.proposalId).toBe(proposal.proposalId)
    expect(decision.federationId).toBe(fed)
    expect(decision.epochId).toBe(epochId)
    expect(decision.outcome).toBe('ACCEPTED')
    expect(decision.decisionId).toMatch(/^id-/)
    expect(decision.decidedAt).toBe('2026-08-04T00:00:00.000Z')
    expect(decision.decisionHash).toMatch(/^sha256:/)
  })

  it('REJECTED decision works', () => {
    const proposal = buildMembershipProposal(
      { federationId: fed, epochId, kind: 'REMOVE', targetNodeId: nodeB },
      deps,
    )
    const decision = buildMembershipDecision(proposal, 'REJECTED', deps)
    expect(decision.outcome).toBe('REJECTED')
  })

  it('decisionHash is bound to outcome (ACCEPTED ≠ REJECTED)', () => {
    const proposal = buildMembershipProposal(
      { federationId: fed, epochId, kind: 'JOIN', targetNodeId: nodeA },
      deps,
    )
    const seqBefore = idSeq
    const a = buildMembershipDecision(proposal, 'ACCEPTED', deps)
    idSeq = seqBefore
    const r = buildMembershipDecision(proposal, 'REJECTED', deps)
    expect(a.decisionHash).not.toBe(r.decisionHash)
  })

  it('returns frozen record', () => {
    const proposal = buildMembershipProposal({ federationId: fed, epochId, kind: 'JOIN', targetNodeId: nodeA }, deps)
    expect(Object.isFrozen(buildMembershipDecision(proposal, 'ACCEPTED', deps))).toBe(true)
  })
})

// ── FederationService additions ───────────────────────────────────────────────

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

describe('FederationService.formFederation', () => {
  it('returns an epoch with epochNumber 1', () => {
    const svc = mkService()
    const manifest: FederationManifest = buildFederationManifest(
      { federationId: fed, name: 'Test Fed', trustDomain: 'td-1', tenantId: 'tenant-1' },
      deps,
    )
    const epoch: FederationEpoch = svc.formFederation(manifest)
    expect(epoch.epochNumber).toBe(1)
    expect(epoch.federationId).toBe(fed)
    expect(epoch.epochId).toMatch(/^id-/)
    expect(epoch.epochHash).toMatch(/^sha256:/)
    expect(epoch.previousEpochId).toBeUndefined()
  })
})

describe('FederationService.advanceEpoch', () => {
  it('returns an ACCEPTED MembershipDecision', () => {
    const svc = mkService()
    const proposal = buildMembershipProposal(
      { federationId: fed, epochId, kind: 'JOIN', targetNodeId: nodeB },
      deps,
    )
    const decision = svc.advanceEpoch(fed, proposal)
    expect(decision.proposalId).toBe(proposal.proposalId)
    expect(decision.outcome).toBe('ACCEPTED')
    expect(decision.federationId).toBe(fed)
  })
})
