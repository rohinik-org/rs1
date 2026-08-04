import { describe, it, expect, beforeEach } from 'vitest'

import {
  buildFederatedPlacementRequest,
  buildPlacementCandidateAssessment,
  buildDistributedPlan,
  buildPlacementDecision,
  selectPlacementNode,
  FederationService,
  FEDERATION_ERROR_CODES,
  type FederatedPlacementRequest,
  type PlacementCandidateAssessment,
  type DistributedPlan,
  type PlacementDecision,
  type PlacementId,
  type FederationId,
  type EpochId,
  type NodeId,
  type PlanId,
  type ContentHash,
  type IsoTimestamp,
  type HashPort,
  type IdPort,
  type ClockPort,
  type CapabilityBindingRef,
  type PlacementPolicyConstraints,
  type PlacementResidencyConstraints,
  type PlacementBudgetConstraints,
  type PlacementDeadlineConstraints,
  type PlacementReliabilityConstraints,
  type PlacementTrustConstraints,
  type StepNodeBinding,
  type DataTransferStep,
  type FallbackConstraints,
} from '../index.js'

// ── Deterministic test deps ───────────────────────────────────────────────────

const hashPort: HashPort = { hash: (v) => `sha256:${JSON.stringify(v)}` as ContentHash }
let idSeq = 0
const idPort: IdPort = { generate: () => `id-${++idSeq}` }
const clockPort: ClockPort = { monotonicNow: () => '2026-08-04T00:00:00.000Z' as IsoTimestamp }
const deps = { id: idPort, hash: hashPort, clock: clockPort }

beforeEach(() => { idSeq = 0 })

const fed = 'fed-1' as FederationId
const epochId = 'epoch-1' as EpochId
const nodeA = 'node-A' as NodeId
const nodeB = 'node-B' as NodeId
const placementId = 'placement-1' as PlacementId

const capRef: CapabilityBindingRef = {
  capabilityId: 'cap-compute',
  bindingHash: 'sha256:cap-hash' as ContentHash,
}

const policyConstraints: PlacementPolicyConstraints = {
  maxTrustLevel: 'HIGH',
  requiredConsistencyClass: 'STRONG_CONTROL',
  policyHash: 'sha256:policy-hash' as ContentHash,
}

const residencyConstraints: PlacementResidencyConstraints = {
  allowedRegions: ['us-east', 'eu-west'],
  forbiddenRegions: ['cn-north'],
  residencyHash: 'sha256:residency-hash' as ContentHash,
}

const budgetConstraints: PlacementBudgetConstraints = {
  maxCostUnits: 1000,
  budgetHash: 'sha256:budget-hash' as ContentHash,
}

const deadlineConstraints: PlacementDeadlineConstraints = {
  deadlineAt: '2026-08-04T02:00:00.000Z' as IsoTimestamp,
  deadlineHash: 'sha256:deadline-hash' as ContentHash,
}

const reliabilityConstraints: PlacementReliabilityConstraints = {
  minReliabilityScore: 0.99,
  reliabilityHash: 'sha256:reliability-hash' as ContentHash,
}

const trustConstraints: PlacementTrustConstraints = {
  requiredTrustDomain: 'acme.internal',
  trustHash: 'sha256:trust-hash' as ContentHash,
}

function makePlacementArgs() {
  return {
    federationId: fed,
    epochId,
    capabilityRef: capRef,
    policyConstraints,
    residencyConstraints,
    budgetConstraints,
    deadlineConstraints,
    reliabilityConstraints,
    trustConstraints,
  }
}

// ── buildFederatedPlacementRequest ────────────────────────────────────────────

describe('buildFederatedPlacementRequest', () => {
  it('produces a record with all required fields', () => {
    const req = buildFederatedPlacementRequest(makePlacementArgs(), deps)
    expect(req.placementId).toMatch(/^id-/)
    expect(req.federationId).toBe(fed)
    expect(req.epochId).toBe(epochId)
    expect(req.requestedAt).toBe('2026-08-04T00:00:00.000Z')
    expect(req.capabilityRef.capabilityId).toBe('cap-compute')
    expect(req.policyConstraints.requiredConsistencyClass).toBe('STRONG_CONTROL')
    expect(req.residencyConstraints.allowedRegions).toContain('us-east')
    expect(req.budgetConstraints.maxCostUnits).toBe(1000)
    expect(req.deadlineConstraints.deadlineAt).toBeDefined()
    expect(req.reliabilityConstraints.minReliabilityScore).toBe(0.99)
    expect(req.trustConstraints.requiredTrustDomain).toBe('acme.internal')
    expect(req.requestHash).toMatch(/^sha256:/)
  })

  it('returns a frozen record', () => {
    const req = buildFederatedPlacementRequest(makePlacementArgs(), deps)
    expect(Object.isFrozen(req)).toBe(true)
  })

  it('requestHash is deterministic (same id seq → same hash)', () => {
    const args = makePlacementArgs()
    const before = idSeq
    const a = buildFederatedPlacementRequest(args, deps)
    idSeq = before
    const b = buildFederatedPlacementRequest(args, deps)
    expect(a.requestHash).toBe(b.requestHash)
  })
})

// ── buildPlacementCandidateAssessment ─────────────────────────────────────────

describe('buildPlacementCandidateAssessment', () => {
  it('produces an eligible assessment', () => {
    const a = buildPlacementCandidateAssessment(
      { placementId, nodeId: nodeA, eligible: true, ineligibilityReasons: [] },
      deps,
    )
    expect(a.assessmentId).toMatch(/^id-/)
    expect(a.placementId).toBe(placementId)
    expect(a.nodeId).toBe(nodeA)
    expect(a.eligible).toBe(true)
    expect(a.ineligibilityReasons).toHaveLength(0)
    expect(a.assessmentHash).toMatch(/^sha256:/)
    expect(a.assessedAt).toBeDefined()
  })

  it('produces an ineligible assessment with reasons', () => {
    const a = buildPlacementCandidateAssessment(
      {
        placementId,
        nodeId: nodeB,
        eligible: false,
        ineligibilityReasons: ['REGION_FORBIDDEN', 'TRUST_DOMAIN_MISMATCH'],
      },
      deps,
    )
    expect(a.eligible).toBe(false)
    expect(a.ineligibilityReasons).toContain('REGION_FORBIDDEN')
    expect(a.ineligibilityReasons).toContain('TRUST_DOMAIN_MISMATCH')
  })

  it('returns a frozen record', () => {
    const a = buildPlacementCandidateAssessment(
      { placementId, nodeId: nodeA, eligible: true, ineligibilityReasons: [] },
      deps,
    )
    expect(Object.isFrozen(a)).toBe(true)
  })
})

// ── selectPlacementNode ───────────────────────────────────────────────────────

describe('selectPlacementNode', () => {
  it('returns undefined when no candidates', () => {
    const req = buildFederatedPlacementRequest(makePlacementArgs(), deps)
    expect(selectPlacementNode(req, [])).toBeUndefined()
  })

  it('returns undefined when all candidates are ineligible', () => {
    const req = buildFederatedPlacementRequest(makePlacementArgs(), deps)
    const a1 = buildPlacementCandidateAssessment(
      { placementId: req.placementId, nodeId: nodeA, eligible: false, ineligibilityReasons: ['REGION_FORBIDDEN'] },
      deps,
    )
    const a2 = buildPlacementCandidateAssessment(
      { placementId: req.placementId, nodeId: nodeB, eligible: false, ineligibilityReasons: ['TRUST_DOMAIN_MISMATCH'] },
      deps,
    )
    expect(selectPlacementNode(req, [a1, a2])).toBeUndefined()
  })

  it('returns nodeId when at least one candidate is eligible', () => {
    const req = buildFederatedPlacementRequest(makePlacementArgs(), deps)
    const a1 = buildPlacementCandidateAssessment(
      { placementId: req.placementId, nodeId: nodeA, eligible: false, ineligibilityReasons: ['REGION_FORBIDDEN'] },
      deps,
    )
    const a2 = buildPlacementCandidateAssessment(
      { placementId: req.placementId, nodeId: nodeB, eligible: true, ineligibilityReasons: [] },
      deps,
    )
    const result = selectPlacementNode(req, [a1, a2])
    expect(result).toBe(nodeB)
  })

  it('LAW-120: returns undefined when eligible node consistency class mismatches required', () => {
    // requiredConsistencyClass is STRONG_CONTROL; node has EVENTUAL_OBSERVATION
    const req = buildFederatedPlacementRequest(makePlacementArgs(), deps)
    const a1 = buildPlacementCandidateAssessment(
      {
        placementId: req.placementId,
        nodeId: nodeA,
        eligible: true,
        ineligibilityReasons: [],
        consistencyClass: 'EVENTUAL_OBSERVATION',
      },
      deps,
    )
    expect(selectPlacementNode(req, [a1])).toBeUndefined()
  })

  it('LAW-120: returns nodeId when eligible node consistency class matches required', () => {
    const req = buildFederatedPlacementRequest(makePlacementArgs(), deps)
    const a1 = buildPlacementCandidateAssessment(
      {
        placementId: req.placementId,
        nodeId: nodeA,
        eligible: true,
        ineligibilityReasons: [],
        consistencyClass: 'STRONG_CONTROL',
      },
      deps,
    )
    expect(selectPlacementNode(req, [a1])).toBe(nodeA)
  })

  it('LAW-123: selection is deterministic — same candidates, same result regardless of array order', () => {
    const req = buildFederatedPlacementRequest(makePlacementArgs(), deps)
    const nodeC = 'node-C' as NodeId
    const nodeD = 'node-D' as NodeId
    const a1 = buildPlacementCandidateAssessment(
      { placementId: req.placementId, nodeId: nodeC, eligible: true, ineligibilityReasons: [], consistencyClass: 'STRONG_CONTROL' },
      deps,
    )
    const a2 = buildPlacementCandidateAssessment(
      { placementId: req.placementId, nodeId: nodeD, eligible: true, ineligibilityReasons: [], consistencyClass: 'STRONG_CONTROL' },
      deps,
    )
    // Same candidates in different order must yield same result
    const r1 = selectPlacementNode(req, [a1, a2])
    const r2 = selectPlacementNode(req, [a2, a1])
    expect(r1).toBe(r2)
    // First alphabetically: 'node-C' < 'node-D'
    expect(r1).toBe(nodeC)
  })
})

// ── buildPlacementDecision ────────────────────────────────────────────────────

describe('buildPlacementDecision', () => {
  it('produces a PLACED decision with selectedNodeId', () => {
    const req = buildFederatedPlacementRequest(makePlacementArgs(), deps)
    const assessment = buildPlacementCandidateAssessment(
      { placementId: req.placementId, nodeId: nodeA, eligible: true, ineligibilityReasons: [], consistencyClass: 'STRONG_CONTROL' },
      deps,
    )
    const decision = buildPlacementDecision(req, { outcome: 'PLACED', selectedNodeId: nodeA }, deps, [assessment])
    expect(decision.decisionId).toMatch(/^id-/)
    expect(decision.placementId).toBe(req.placementId)
    expect(decision.federationId).toBe(fed)
    expect(decision.epochId).toBe(epochId)
    expect(decision.outcome).toBe('PLACED')
    expect(decision.selectedNodeId).toBe(nodeA)
    expect(decision.rejectionReason).toBeUndefined()
    expect(decision.decisionHash).toMatch(/^sha256:/)
    expect(Object.isFrozen(decision)).toBe(true)
  })

  it('produces a REJECTED decision with rejectionReason', () => {
    const req = buildFederatedPlacementRequest(makePlacementArgs(), deps)
    const decision = buildPlacementDecision(req, { outcome: 'REJECTED', rejectionReason: 'NO_ELIGIBLE_NODES' }, deps, [])
    expect(decision.outcome).toBe('REJECTED')
    expect(decision.rejectionReason).toBe('NO_ELIGIBLE_NODES')
    expect(decision.selectedNodeId).toBeUndefined()
  })

  it('LAW-120: PLACED throws FEDERATION_POLICY_WEAKENED when selected node has no eligible assessment', () => {
    const req = buildFederatedPlacementRequest(makePlacementArgs(), deps)
    const ineligibleAssessment = buildPlacementCandidateAssessment(
      { placementId: req.placementId, nodeId: nodeA, eligible: false, ineligibilityReasons: ['TRUST_DOMAIN_MISMATCH'] },
      deps,
    )
    // Passing nodeA as selected but the only assessment for nodeA is ineligible
    expect(() => buildPlacementDecision(req, { outcome: 'PLACED', selectedNodeId: nodeA }, deps, [ineligibleAssessment])).toThrow(
      FEDERATION_ERROR_CODES.FEDERATION_POLICY_WEAKENED,
    )
  })

  it('LAW-120: PLACED throws FEDERATION_POLICY_WEAKENED when selected node has no assessment at all', () => {
    const req = buildFederatedPlacementRequest(makePlacementArgs(), deps)
    // nodeA never assessed
    expect(() => buildPlacementDecision(req, { outcome: 'PLACED', selectedNodeId: nodeA }, deps, [])).toThrow(
      FEDERATION_ERROR_CODES.FEDERATION_POLICY_WEAKENED,
    )
  })
})

// ── buildDistributedPlan ──────────────────────────────────────────────────────

describe('buildDistributedPlan', () => {
  it('produces a plan with all required fields and planHash', () => {
    const stepBindings: StepNodeBinding[] = [
      { stepId: 'step-1', nodeId: nodeA, consistencyClass: 'STRONG_CONTROL' },
    ]
    const dataTransferPlan: DataTransferStep[] = [
      {
        fromNodeId: nodeA,
        toNodeId: nodeB,
        artifactRef: 'artifact-1',
        transferHash: 'sha256:transfer-hash' as ContentHash,
      },
    ]
    const fallbackConstraints: FallbackConstraints = {
      allowLocalFallback: true,
      maxRetries: 3,
    }
    const plan = buildDistributedPlan(
      { federationId: fed, epochId, stepBindings, dataTransferPlan, fallbackConstraints },
      deps,
    )
    expect(plan.planId).toMatch(/^id-/)
    expect(plan.federationId).toBe(fed)
    expect(plan.epochId).toBe(epochId)
    expect(plan.createdAt).toBeDefined()
    expect(plan.stepBindings).toHaveLength(1)
    expect(plan.stepBindings[0]!.stepId).toBe('step-1')
    expect(plan.dataTransferPlan).toHaveLength(1)
    expect(plan.fallbackConstraints.allowLocalFallback).toBe(true)
    expect(plan.fallbackConstraints.maxRetries).toBe(3)
    expect(plan.planHash).toMatch(/^sha256:/)
    expect(Object.isFrozen(plan)).toBe(true)
  })
})

// ── FederationService.planPlacement ──────────────────────────────────────────

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

describe('FederationService.planPlacement', () => {
  it('returns PLACED decision when eligible candidate exists', () => {
    const svc = mkService()
    const req = buildFederatedPlacementRequest(makePlacementArgs(), deps)
    const assessment = buildPlacementCandidateAssessment(
      { placementId: req.placementId, nodeId: nodeA, eligible: true, ineligibilityReasons: [], consistencyClass: 'STRONG_CONTROL' },
      deps,
    )
    const decision = svc.planPlacement(req, [assessment])
    expect(decision.outcome).toBe('PLACED')
    expect(decision.selectedNodeId).toBe(nodeA)
  })

  it('returns REJECTED decision when no eligible candidates', () => {
    const svc = mkService()
    const req = buildFederatedPlacementRequest(makePlacementArgs(), deps)
    const assessment = buildPlacementCandidateAssessment(
      { placementId: req.placementId, nodeId: nodeA, eligible: false, ineligibilityReasons: ['TRUST_DOMAIN_MISMATCH'] },
      deps,
    )
    const decision = svc.planPlacement(req, [assessment])
    expect(decision.outcome).toBe('REJECTED')
    expect(decision.rejectionReason).toBeDefined()
  })

  it('returns REJECTED when consistency class mismatches', () => {
    const svc = mkService()
    const req = buildFederatedPlacementRequest(makePlacementArgs(), deps)
    const assessment = buildPlacementCandidateAssessment(
      { placementId: req.placementId, nodeId: nodeA, eligible: true, ineligibilityReasons: [], consistencyClass: 'EVENTUAL_OBSERVATION' },
      deps,
    )
    const decision = svc.planPlacement(req, [assessment])
    expect(decision.outcome).toBe('REJECTED')
  })
})
