import { describe, it, expect, beforeEach } from 'vitest'

import {
  buildRemoteExecutionRequest,
  buildRemoteExecutionAcceptance,
  buildRemoteExecutionRejection,
  buildRemoteExecutionResult,
  buildEvidenceCorrelation,
  buildReplayProtectionRecord,
  FederationService,
  FEDERATION_ERROR_CODES,
  type RemoteExecutionRequest,
  type RemoteExecutionAcceptance,
  type RemoteExecutionRejection,
  type RemoteExecutionResult,
  type EvidenceCorrelation,
  type ReplayProtectionRecord,
  type RemoteExecutionId,
  type FederationId,
  type EpochId,
  type NodeId,
  type DecisionId,
  type ContentHash,
  type IsoTimestamp,
  type HashPort,
  type IdPort,
  type ClockPort,
} from '../index.js'

// ── Deterministic test deps ───────────────────────────────────────────────────

const hashPort: HashPort = { hash: (v) => `sha256:${JSON.stringify(v)}` as ContentHash }
let idSeq = 0
const idPort: IdPort = { generate: () => `id-${++idSeq}` }
const clockPort: ClockPort = { monotonicNow: () => '2026-08-04T00:00:00.000Z' as IsoTimestamp }
const deps = { id: idPort, hash: hashPort, clock: clockPort }

beforeEach(() => { idSeq = 0 })

// ── Fixtures ──────────────────────────────────────────────────────────────────

const fed = 'fed-1' as FederationId
const epochId = 'epoch-1' as EpochId
const originNode = 'node-origin' as NodeId
const targetNode = 'node-target' as NodeId
const decisionId = 'decision-1' as DecisionId
const requestId = 'req-1' as RemoteExecutionId
const admittedNodeIds: readonly NodeId[] = [originNode, targetNode]

const baseRequestArgs = {
  originNodeId: originNode,
  targetNodeId: targetNode,
  federationId: fed,
  epochId,
  placementDecisionId: decisionId,
  traceId: 'trace-abc',
  spanId: 'span-xyz',
  policyRef: 'sha256:policy' as ContentHash,
  contextRef: 'sha256:context' as ContentHash,
  artifactRefs: ['ref-1', 'ref-2'] as readonly string[],
  timeoutMs: 5000,
  admittedNodeIds,
}

// ── RemoteExecutionRequest ────────────────────────────────────────────────────

describe('buildRemoteExecutionRequest', () => {
  it('produces a frozen record with all required fields and a requestHash', () => {
    const req = buildRemoteExecutionRequest(baseRequestArgs, deps)
    expect(req.requestId).toBeDefined()
    expect(req.originNodeId).toBe(originNode)
    expect(req.targetNodeId).toBe(targetNode)
    expect(req.federationId).toBe(fed)
    expect(req.epochId).toBe(epochId)
    expect(req.placementDecisionId).toBe(decisionId)
    expect(req.traceId).toBe('trace-abc')
    expect(req.spanId).toBe('span-xyz')
    expect(req.policyRef).toBe('sha256:policy')
    expect(req.contextRef).toBe('sha256:context')
    expect(req.artifactRefs).toEqual(['ref-1', 'ref-2'])
    expect(req.timeoutMs).toBe(5000)
    expect(req.requestHash).toBeDefined()
    expect(Object.isFrozen(req)).toBe(true)
  })

  it('LAW-119: throws FEDERATION_NODE_NOT_ADMITTED when targetNodeId is not in admittedNodeIds', () => {
    const unadmittedTarget = 'node-unknown' as NodeId
    expect(() =>
      buildRemoteExecutionRequest({ ...baseRequestArgs, targetNodeId: unadmittedTarget }, deps)
    ).toThrow(FEDERATION_ERROR_CODES.FEDERATION_NODE_NOT_ADMITTED)
  })

  it('LAW-119: succeeds when targetNodeId is in admittedNodeIds', () => {
    const req = buildRemoteExecutionRequest(baseRequestArgs, deps)
    expect(req.targetNodeId).toBe(targetNode)
  })
})

// ── RemoteExecutionAcceptance ─────────────────────────────────────────────────

describe('buildRemoteExecutionAcceptance', () => {
  it('produces a frozen record with acceptanceId, requestId, acceptedAt, acceptanceHash', () => {
    const acc = buildRemoteExecutionAcceptance(requestId, deps)
    expect(acc.acceptanceId).toBeDefined()
    expect(acc.requestId).toBe(requestId)
    expect(acc.acceptedAt).toBeDefined()
    expect(acc.acceptanceHash).toBeDefined()
    expect(Object.isFrozen(acc)).toBe(true)
  })
})

// ── RemoteExecutionRejection ──────────────────────────────────────────────────

describe('buildRemoteExecutionRejection', () => {
  it('produces a frozen record with rejectionId, requestId, rejectedAt, reason, rejectionHash', () => {
    const rej = buildRemoteExecutionRejection(requestId, 'node capacity exceeded', deps)
    expect(rej.rejectionId).toBeDefined()
    expect(rej.requestId).toBe(requestId)
    expect(rej.rejectedAt).toBeDefined()
    expect(rej.reason).toBe('node capacity exceeded')
    expect(rej.rejectionHash).toBeDefined()
    expect(Object.isFrozen(rej)).toBe(true)
  })
})

// ── RemoteExecutionResult ─────────────────────────────────────────────────────

describe('buildRemoteExecutionResult', () => {
  it('produces a frozen record with all required fields and a resultHash', () => {
    const result = buildRemoteExecutionResult(
      {
        requestId,
        federationId: fed,
        outcomeKind: 'SUCCESS',
        artifactResultRefs: ['out-ref-1'] as readonly string[],
        evidenceCorrelationId: 'corr-123',
      },
      deps,
    )
    expect(result.resultId).toBeDefined()
    expect(result.requestId).toBe(requestId)
    expect(result.federationId).toBe(fed)
    expect(result.completedAt).toBeDefined()
    expect(result.outcomeKind).toBe('SUCCESS')
    expect(result.artifactResultRefs).toEqual(['out-ref-1'])
    expect(result.evidenceCorrelationId).toBe('corr-123')
    expect(result.resultHash).toBeDefined()
    expect(Object.isFrozen(result)).toBe(true)
  })

  it('LAW-122: throws FEDERATION_EVIDENCE_MISSING when evidenceCorrelationId is empty string', () => {
    expect(() =>
      buildRemoteExecutionResult(
        { requestId, federationId: fed, outcomeKind: 'SUCCESS', artifactResultRefs: [], evidenceCorrelationId: '' },
        deps,
      )
    ).toThrow(FEDERATION_ERROR_CODES.FEDERATION_EVIDENCE_MISSING)
  })

  it('LAW-122: throws FEDERATION_EVIDENCE_MISSING when evidenceCorrelationId is whitespace', () => {
    expect(() =>
      buildRemoteExecutionResult(
        { requestId, federationId: fed, outcomeKind: 'FAILURE', artifactResultRefs: [], evidenceCorrelationId: '   ' },
        deps,
      )
    ).toThrow(FEDERATION_ERROR_CODES.FEDERATION_EVIDENCE_MISSING)
  })
})

// ── EvidenceCorrelation ───────────────────────────────────────────────────────

describe('buildEvidenceCorrelation', () => {
  it('produces a frozen record with correlationId, requestId, federationId, refs, correlatedAt, correlationHash', () => {
    const originRef = 'sha256:origin-evidence' as ContentHash
    const targetRef = 'sha256:target-evidence' as ContentHash
    const corr = buildEvidenceCorrelation(requestId, fed, originRef, targetRef, deps)
    expect(corr.correlationId).toBeDefined()
    expect(corr.requestId).toBe(requestId)
    expect(corr.federationId).toBe(fed)
    expect(corr.originEvidenceRef).toBe(originRef)
    expect(corr.targetEvidenceRef).toBe(targetRef)
    expect(corr.correlatedAt).toBeDefined()
    expect(corr.correlationHash).toBeDefined()
    expect(Object.isFrozen(corr)).toBe(true)
  })
})

// ── ReplayProtectionRecord ────────────────────────────────────────────────────

describe('buildReplayProtectionRecord', () => {
  it('produces a frozen record with nonce, requestId, recordedAt, nonceHash', () => {
    const rpr = buildReplayProtectionRecord(requestId, deps)
    expect(rpr.nonce).toBeDefined()
    expect(rpr.requestId).toBe(requestId)
    expect(rpr.recordedAt).toBeDefined()
    expect(rpr.nonceHash).toBeDefined()
    expect(Object.isFrozen(rpr)).toBe(true)
  })
})

// ── FederationService integration ────────────────────────────────────────────

describe('FederationService', () => {
  // minimal stub ports
  const noopTransport = {
    send: async () => {},
    receive: async function* () {},
  }
  const noopAttestation = {
    attest: async () => ({ attestationId: 'att-1', nodeId: originNode, attestationHash: 'sha256:att' as ContentHash, attestedAt: '2026-08-04T00:00:00.000Z' as IsoTimestamp }),
    verify: async () => true,
  }
  const noopPolicy = { evaluate: async () => ({ admitted: true }) }
  const noopRouting = { resolveTarget: async () => undefined }
  const noopTrust = { getTrustSnapshot: async () => undefined }
  const noopEvidence = { open: async () => 'ev-1' as any, record: async () => {}, seal: async () => {} }
  const noopCoordination = { leaderHint: async () => undefined }

  let service: FederationService

  beforeEach(() => {
    idSeq = 0
    service = new FederationService(
      noopTransport as any,
      noopAttestation as any,
      noopPolicy,
      noopRouting,
      noopTrust,
      noopEvidence as any,
      noopCoordination,
      clockPort,
      idPort,
      hashPort,
    )
  })

  describe('initiateRemoteExecution', () => {
    it('returns a RemoteExecutionAcceptance for a valid request', () => {
      const req = buildRemoteExecutionRequest(baseRequestArgs, deps)
      const acc = service.initiateRemoteExecution(req)
      expect(acc.requestId).toBe(req.requestId)
      expect(acc.acceptanceId).toBeDefined()
      expect(acc.acceptanceHash).toBeDefined()
    })
  })

  describe('completeRemoteExecution', () => {
    it('returns an EvidenceCorrelation when result has evidenceCorrelationId', () => {
      const result = buildRemoteExecutionResult(
        { requestId, federationId: fed, outcomeKind: 'SUCCESS', artifactResultRefs: [], evidenceCorrelationId: 'corr-abc' },
        deps,
      )
      const corr = service.completeRemoteExecution(result)
      expect(corr.requestId).toBe(requestId)
      expect(corr.federationId).toBe(fed)
      expect(corr.correlationId).toBeDefined()
      expect(corr.correlationHash).toBeDefined()
    })
  })
})
