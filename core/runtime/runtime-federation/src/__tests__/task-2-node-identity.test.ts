import { describe, it, expect } from 'vitest'

import {
  buildFederatedNodeIdentity,
  buildAttestationReference,
  buildAdmissionRequest,
  buildAdmissionDecision,
  buildRevocationDirective,
  buildRevocationRecord,
  FederationService,
  FederationError,
  type NodeId,
  type FederationId,
  type ContentHash,
  type IsoTimestamp,
  type ConsistencyClass,
  type AttestationEvidence,
  type AdmissionRequest,
  type AdmissionAssessment,
  type TrustSnapshot,
  type HashPort,
  type IdPort,
  type ClockPort,
} from '../index.js'

// ── Deterministic test deps ───────────────────────────────────────────────────

// hash = length-tagged JSON echo so equal input → equal output, differing input → differing output.
const hashPort: HashPort = { hash: (v) => `sha256:${JSON.stringify(v)}` as ContentHash }
let idSeq = 0
const idPort: IdPort = { generate: () => `id-${idSeq++}` }
const clockPort: ClockPort = { monotonicNow: () => '2026-08-04T00:00:00.000Z' as IsoTimestamp }
const deps = { id: idPort, hash: hashPort, clock: clockPort }

const nodeA = 'node-A' as NodeId
const nodeB = 'node-B' as NodeId
const fed = 'fed-1' as FederationId

function trustFor(nodeId: NodeId): TrustSnapshot {
  return { nodeId, trustHash: 'sha256:trust' as ContentHash, capturedAt: clockPort.monotonicNow() }
}

// ── FederatedNodeIdentity ─────────────────────────────────────────────────────

describe('buildFederatedNodeIdentity', () => {
  it('produces a record with all required fields', () => {
    const idn = buildFederatedNodeIdentity(
      { nodeId: nodeA, trustDomainId: 'td-1', tenantId: 'tenant-1', publicKeyRef: 'key-ref-A' },
      deps,
    )
    expect(idn.nodeId).toBe(nodeA)
    expect(idn.trustDomainId).toBe('td-1')
    expect(idn.tenantId).toBe('tenant-1')
    expect(idn.publicKeyRef).toBe('key-ref-A')
    expect(idn.createdAt).toBe('2026-08-04T00:00:00.000Z')
    expect(idn.identityHash).toMatch(/^sha256:/)
  })

  it('identityHash is deterministic (same input = same hash)', () => {
    const args = { nodeId: nodeA, trustDomainId: 'td-1', tenantId: 'tenant-1', publicKeyRef: 'key-ref-A' } as const
    expect(buildFederatedNodeIdentity(args, deps).identityHash)
      .toBe(buildFederatedNodeIdentity(args, deps).identityHash)
  })

  it('LAW-118: identityHash binds nodeId (changes when nodeId changes)', () => {
    const a = buildFederatedNodeIdentity({ nodeId: nodeA, trustDomainId: 'td-1', tenantId: 'tenant-1', publicKeyRef: 'key-ref-A' }, deps)
    const b = buildFederatedNodeIdentity({ nodeId: nodeB, trustDomainId: 'td-1', tenantId: 'tenant-1', publicKeyRef: 'key-ref-A' }, deps)
    expect(a.identityHash).not.toBe(b.identityHash)
  })

  it('LAW-118: identityHash binds publicKeyRef (changes when key changes)', () => {
    const a = buildFederatedNodeIdentity({ nodeId: nodeA, trustDomainId: 'td-1', tenantId: 'tenant-1', publicKeyRef: 'key-ref-A' }, deps)
    const b = buildFederatedNodeIdentity({ nodeId: nodeA, trustDomainId: 'td-1', tenantId: 'tenant-1', publicKeyRef: 'key-ref-B' }, deps)
    expect(a.identityHash).not.toBe(b.identityHash)
  })
})

// ── AttestationReference ──────────────────────────────────────────────────────

describe('buildAttestationReference', () => {
  const evidence: AttestationEvidence = {
    evidenceKind: 'TPM_QUOTE',
    evidencePayloadHash: 'sha256:payload' as ContentHash,
    attestedAt: '2026-08-04T00:00:00.000Z' as IsoTimestamp,
  }

  it('produces a hashed reference bound to the node', () => {
    const ref = buildAttestationReference(evidence, nodeA, deps)
    expect(ref.nodeId).toBe(nodeA)
    expect(ref.attestationId).toMatch(/^id-/)
    expect(ref.attestationHash).toMatch(/^sha256:/)
    expect(ref.attestedAt).toBe('2026-08-04T00:00:00.000Z')
  })

  it('attestationHash binds the node', () => {
    const a = buildAttestationReference(evidence, nodeA, deps)
    const b = buildAttestationReference(evidence, nodeB, deps)
    expect(a.attestationHash).not.toBe(b.attestationHash)
  })
})

// ── AdmissionRequest ──────────────────────────────────────────────────────────

describe('buildAdmissionRequest', () => {
  it('produces a record with requestHash', () => {
    const req = buildAdmissionRequest(
      {
        nodeId: nodeA,
        federationId: fed,
        allowedConsistencyClasses: ['STRONG_CONTROL', 'CAUSAL_EVIDENCE'],
        policyConstraints: ['no-egress'],
        residencyConstraints: ['eu-only'],
      },
      deps,
    )
    expect(req.nodeId).toBe(nodeA)
    expect(req.federationId).toBe(fed)
    expect(req.admissionId).toMatch(/^id-/)
    expect(req.requestHash).toMatch(/^sha256:/)
    expect(req.allowedConsistencyClasses).toEqual(['STRONG_CONTROL', 'CAUSAL_EVIDENCE'])
    expect(req.requestedAt).toBe('2026-08-04T00:00:00.000Z')
  })
})

// ── AdmissionDecision ─────────────────────────────────────────────────────────

function mkRequest(classes: readonly ConsistencyClass[]): AdmissionRequest {
  return buildAdmissionRequest(
    { nodeId: nodeA, federationId: fed, allowedConsistencyClasses: classes, policyConstraints: [], residencyConstraints: [] },
    deps,
  )
}

function mkAssessment(req: AdmissionRequest, trust: TrustSnapshot): AdmissionAssessment {
  return {
    assessmentId: 'assess-1',
    admissionId: req.admissionId,
    assessedAt: clockPort.monotonicNow(),
    assessmentHash: 'sha256:assess' as ContentHash,
    trustSnapshot: trust,
    policySnapshot: { policyHash: 'sha256:pol' as ContentHash },
  }
}

describe('buildAdmissionDecision', () => {
  it('ADMITTED with non-empty allowedConsistencyClasses succeeds (LAW-119)', () => {
    const req = mkRequest(['STRONG_CONTROL'])
    const dec = buildAdmissionDecision(req, mkAssessment(req, trustFor(nodeA)), 'ADMITTED', deps)
    expect(dec.outcome).toBe('ADMITTED')
    expect(dec.nodeId).toBe(nodeA)
    expect(dec.decisionHash).toMatch(/^sha256:/)
    expect(dec.rejectionReason).toBeUndefined()
  })

  it('LAW-119: ADMITTED with empty allowedConsistencyClasses is rejected', () => {
    const req = mkRequest([])
    expect(() => buildAdmissionDecision(req, mkAssessment(req, trustFor(nodeA)), 'ADMITTED', deps)).toThrow(FederationError)
  })

  it('REJECTED allowed with empty allowedConsistencyClasses', () => {
    const req = mkRequest([])
    const dec = buildAdmissionDecision(req, mkAssessment(req, trustFor(nodeA)), 'REJECTED', deps, 'no evidence')
    expect(dec.outcome).toBe('REJECTED')
    expect(dec.rejectionReason).toBe('no evidence')
  })

  it('LAW-121: assessment trustSnapshot must match the admitted node (no cross-node propagation)', () => {
    const req = mkRequest(['STRONG_CONTROL']) // for nodeA
    const foreignAssessment = mkAssessment(req, trustFor(nodeB)) // trust captured for nodeB
    expect(() => buildAdmissionDecision(req, foreignAssessment, 'ADMITTED', deps)).toThrow(FederationError)
  })

  it('LAW-121: assessment admissionId must match the request', () => {
    const req = mkRequest(['STRONG_CONTROL'])
    const other = mkAssessment(mkRequest(['STRONG_CONTROL']), trustFor(nodeA))
    expect(() => buildAdmissionDecision(req, other, 'ADMITTED', deps)).toThrow(FederationError)
  })
})

// ── Revocation ────────────────────────────────────────────────────────────────

describe('revocation builders', () => {
  it('buildRevocationDirective produces a hashed directive', () => {
    const dir = buildRevocationDirective(nodeA, fed, 'key compromised', deps)
    expect(dir.nodeId).toBe(nodeA)
    expect(dir.federationId).toBe(fed)
    expect(dir.reason).toBe('key compromised')
    expect(dir.revocationId).toMatch(/^id-/)
    expect(dir.directiveHash).toMatch(/^sha256:/)
  })

  it('buildRevocationRecord carries directive id and drain flag', () => {
    const dir = buildRevocationDirective(nodeA, fed, 'key compromised', deps)
    const rec = buildRevocationRecord(dir, true, deps)
    expect(rec.revocationId).toBe(dir.revocationId)
    expect(rec.nodeId).toBe(nodeA)
    expect(rec.drainCompleted).toBe(true)
    expect(rec.revocationHash).toMatch(/^sha256:/)
  })
})

// ── FederationService ─────────────────────────────────────────────────────────

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

describe('FederationService.admitNode / revokeNode', () => {
  it('admitNode returns an ADMITTED decision for a valid request', () => {
    const svc = mkService()
    const req = mkRequest(['STRONG_CONTROL'])
    const dec = svc.admitNode(req, mkAssessment(req, trustFor(nodeA)))
    expect(dec.outcome).toBe('ADMITTED')
    expect(dec.nodeId).toBe(nodeA)
  })

  it('revokeNode returns a RevocationRecord', () => {
    const svc = mkService()
    const dir = buildRevocationDirective(nodeA, fed, 'drift', deps)
    const rec = svc.revokeNode(dir)
    expect(rec.nodeId).toBe(nodeA)
    expect(rec.revocationId).toBe(dir.revocationId)
    expect(typeof rec.drainCompleted).toBe('boolean')
  })
})
