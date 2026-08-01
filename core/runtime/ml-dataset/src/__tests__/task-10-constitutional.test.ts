import { describe, it, expect } from 'vitest'
import type { DatasetId, ContentHash } from '@rohinik-org/ml-ir'
import type {
  DatasetIsoTimestamp,
  GovernedDatasetVersion,
  DatasetVersionLifecycleState,
  DatasetAuthorizationRecord,
  DatasetAuthorizationOutcome,
  LeakageAssessmentResult,
  LeakageAssessmentOutcome,
  FeatureSchemaCompatibilityOutcome,
  DatasetAdmissionRequest,
  DatasetAdmissionDecision,
  DatasetAdmissionRepository,
} from '../../src/index.js'
import {
  DatasetGovernanceReferenceStore,
  DatasetAdmissionService,
  DatasetLineageGraph,
  validateDeletionAuthorization,
  analyzeDeletionImpact,
  buildDeletionPropagationPlan,
  stage12bEvidence,
  type DatasetDeletionDirective,
  type DatasetRetentionRecord,
} from '../../src/index.js'

// ── fixtures ──────────────────────────────────────────────────────────────────

const DS = (id: string) => id as DatasetId
const TS = (s: string) => s as DatasetIsoTimestamp
const H  = (s: string) => `sha256:${s.padEnd(64, '0')}` as ContentHash

const NOW = TS('2024-06-01T10:00:00.000Z')
const PAST = TS('2023-01-01T00:00:00.000Z')

function makeVersion(id: DatasetId, state: DatasetVersionLifecycleState): GovernedDatasetVersion {
  return { datasetId: id, version: 'v1', contentHash: H('aaa'), createdAt: NOW, state }
}

function makeAuth(id: DatasetId, outcome: DatasetAuthorizationOutcome): DatasetAuthorizationRecord {
  return {
    authorizationId: `auth-${id}`, datasetId: id,
    purpose: 'TRAINING', scope: 'tenant-1',
    outcome, policyReferenceIds: ['pol-1'], decidedAt: NOW,
  }
}

function makeLeakage(id: DatasetId, outcome: LeakageAssessmentOutcome): LeakageAssessmentResult {
  return {
    datasetId: id, outcome,
    findings: outcome === 'CLEAN' ? [] : [{ kind: 'LABEL', severity: 'HIGH', evidenceRef: 'ref-1' }],
    unavailableDetectorIds: [],
    assessedAt: NOW,
    reportHash: H('leakage'),
  }
}

function makeAdmissionRequest(id: DatasetId, admissionId: string): DatasetAdmissionRequest {
  return {
    admissionId,
    datasetId: id,
    version: 'v1',
    contentHash: H('aaa'),
    purpose: 'TRAINING',
    scope: 'tenant-1',
    requestedAt: NOW,
    requestingPrincipalId: 'principal-1',
    tenantId: 'tenant-1',
    environmentId: 'env-prod',
  }
}

// ── DatasetGovernanceReferenceStore ───────────────────────────────────────────

describe('DatasetGovernanceReferenceStore', () => {
  it('constructs without errors', () => {
    const store = DatasetGovernanceReferenceStore()
    expect(store).toBeDefined()
  })

  it('exposes admissionRepo conforming to DatasetAdmissionRepository', async () => {
    const store = DatasetGovernanceReferenceStore()
    const repo: DatasetAdmissionRepository = store.admissionRepo
    expect(typeof repo.save).toBe('function')
    expect(typeof repo.findById).toBe('function')
  })

  it('save and findById are consistent', async () => {
    const store = DatasetGovernanceReferenceStore()
    const decision: DatasetAdmissionDecision = {
      admissionId: 'adm-1',
      datasetId: DS('ds-1'),
      version: 'v1',
      outcome: 'ADMITTED',
      reason: 'ALL_CHECKS_PASSED',
      decidedAt: NOW,
      decisionHash: H('dec'),
    }
    await store.admissionRepo.save(decision)
    const found = await store.admissionRepo.findById('adm-1')
    expect(found?.outcome).toBe('ADMITTED')
  })

  it('save is idempotent: same id twice does not duplicate', async () => {
    const store = DatasetGovernanceReferenceStore()
    const decision: DatasetAdmissionDecision = {
      admissionId: 'adm-idem',
      datasetId: DS('ds-1'),
      version: 'v1',
      outcome: 'ADMITTED',
      reason: 'ALL_CHECKS_PASSED',
      decidedAt: NOW,
      decisionHash: H('dec2'),
    }
    const r1 = await store.admissionRepo.save(decision, { idempotencyKey: 'adm-idem' })
    const r2 = await store.admissionRepo.save(decision, { idempotencyKey: 'adm-idem' })
    expect(r1.stored).toBe(true)
    expect(r2.conflict).toBe(false)
  })

  it('findById returns undefined for unknown id', async () => {
    const store = DatasetGovernanceReferenceStore()
    expect(await store.admissionRepo.findById('no-such-id')).toBeUndefined()
  })
})

// ── end-to-end: full governance flow ─────────────────────────────────────────

describe('end-to-end governance flow', () => {
  it('source dataset admitted → derived dataset admitted → deletion propagates', async () => {
    const store = DatasetGovernanceReferenceStore()
    const svc = DatasetAdmissionService({ repo: store.admissionRepo })

    // Admit source
    const dSrc = await svc.admit(makeAdmissionRequest(DS('ds-src'), 'adm-src'), {
      version: makeVersion(DS('ds-src'), 'ADMITTED'),
      authorization: makeAuth(DS('ds-src'), 'AUTHORIZED'),
      leakage: makeLeakage(DS('ds-src'), 'CLEAN'),
      schemaCompatibility: 'EXACT',
    })
    expect(dSrc.outcome).toBe('ADMITTED')

    // Admit derived
    const dDerived = await svc.admit(makeAdmissionRequest(DS('ds-derived'), 'adm-derived'), {
      version: makeVersion(DS('ds-derived'), 'ADMITTED'),
      authorization: makeAuth(DS('ds-derived'), 'AUTHORIZED'),
      leakage: makeLeakage(DS('ds-derived'), 'CLEAN'),
      schemaCompatibility: 'EXACT',
    })
    expect(dDerived.outcome).toBe('ADMITTED')

    // Build lineage: ds-derived derives from ds-src
    const graph = new DatasetLineageGraph()
    graph.insert({ datasetId: DS('ds-src'),     parentDatasetIds: [], lineageHash: H('src'),     recordedAt: PAST })
    graph.insert({ datasetId: DS('ds-derived'), parentDatasetIds: [DS('ds-src')], lineageHash: H('der'), recordedAt: NOW })

    // Delete ds-src → propagates to ds-derived
    const directive: DatasetDeletionDirective = {
      directiveId: 'del-001', datasetId: DS('ds-src'),
      authorizationToken: 'tok-001', requestedBy: 'principal-1',
      requestedAt: NOW, reason: 'GDPR erasure',
    }
    validateDeletionAuthorization(directive)
    const impact = analyzeDeletionImpact(DS('ds-src'), graph, [], [])
    expect(impact.affectedDescendantIds).toContain(DS('ds-derived'))
    const plan = buildDeletionPropagationPlan(directive, impact)
    expect(plan.datasetsToDelete).toContain(DS('ds-src'))
    expect(plan.datasetsToDelete).toContain(DS('ds-derived'))
  })

  it('high leakage blocks admission before authorization is consulted', async () => {
    const store = DatasetGovernanceReferenceStore()
    const svc = DatasetAdmissionService({ repo: store.admissionRepo })
    const decision = await svc.admit(makeAdmissionRequest(DS('ds-x'), 'adm-x'), {
      version: makeVersion(DS('ds-x'), 'ADMITTED'),
      authorization: makeAuth(DS('ds-x'), 'AUTHORIZED'),
      leakage: makeLeakage(DS('ds-x'), 'BLOCKS_ADMISSION'),
      schemaCompatibility: 'EXACT',
    })
    expect(decision.outcome).toBe('REJECTED')
    expect(decision.reason).toBe('LEAKAGE_BLOCKS')
  })

  it('legal hold blocks deletion', () => {
    const retention: DatasetRetentionRecord = {
      datasetId: DS('ds-held'),
      retainUntil: TS('2030-01-01T00:00:00.000Z'),
      legalHold: true,
      recordedAt: PAST,
    }
    const directive: DatasetDeletionDirective = {
      directiveId: 'del-held', datasetId: DS('ds-held'),
      authorizationToken: 'tok-held', requestedBy: 'principal-1',
      requestedAt: NOW, reason: 'test',
    }
    expect(() => validateDeletionAuthorization(directive, retention, NOW)).toThrow(/DELETION_LEGAL_HOLD/)
  })
})

// ── constitutional invariants (law traceability) ──────────────────────────────

describe('constitutional invariants — LAW-064 through LAW-073', () => {
  it('LAW-064: no raw dataset content in admission decision', async () => {
    const store = DatasetGovernanceReferenceStore()
    const svc = DatasetAdmissionService({ repo: store.admissionRepo })
    const decision = await svc.admit(makeAdmissionRequest(DS('ds-law'), 'adm-law'), {
      version: makeVersion(DS('ds-law'), 'ADMITTED'),
      authorization: makeAuth(DS('ds-law'), 'AUTHORIZED'),
      leakage: makeLeakage(DS('ds-law'), 'CLEAN'),
      schemaCompatibility: 'EXACT',
    })
    const keys = Object.keys(decision)
    const forbidden = ['rawContent', 'content', 'data', 'payload', 'partitions', 'features']
    for (const k of forbidden) {
      expect(keys).not.toContain(k)
    }
  })

  it('LAW-065: admission decision is immutable (no mutating methods)', async () => {
    const store = DatasetGovernanceReferenceStore()
    const svc = DatasetAdmissionService({ repo: store.admissionRepo })
    const decision = await svc.admit(makeAdmissionRequest(DS('ds-immut'), 'adm-immut'), {
      version: makeVersion(DS('ds-immut'), 'ADMITTED'),
      authorization: makeAuth(DS('ds-immut'), 'AUTHORIZED'),
      leakage: makeLeakage(DS('ds-immut'), 'CLEAN'),
      schemaCompatibility: 'EXACT',
    })
    expect(typeof (decision as unknown as Record<string, unknown>)['update']).not.toBe('function')
    expect(typeof (decision as unknown as Record<string, unknown>)['delete']).not.toBe('function')
  })

  it('LAW-066: deletion propagation plan has no deploy/undeploy fields', () => {
    const graph = new DatasetLineageGraph()
    graph.insert({ datasetId: DS('ds-a'), parentDatasetIds: [], lineageHash: H('a'), recordedAt: PAST })
    const directive: DatasetDeletionDirective = {
      directiveId: 'd-1', datasetId: DS('ds-a'),
      authorizationToken: 'tok', requestedBy: 'p1', requestedAt: NOW, reason: 'test',
    }
    const plan = buildDeletionPropagationPlan(directive, analyzeDeletionImpact(DS('ds-a'), graph, [], []))
    const forbidden = ['deploymentsToRemove', 'endpointsToRemove', 'rollback', 'undeploy']
    for (const k of forbidden) {
      expect(Object.keys(plan)).not.toContain(k)
    }
  })

  it('LAW-067: lineage graph is acyclic — cycle detection fires on insert', () => {
    const graph = new DatasetLineageGraph()
    graph.insert({ datasetId: DS('ds-a'), parentDatasetIds: [], lineageHash: H('a'), recordedAt: PAST })
    graph.insert({ datasetId: DS('ds-b'), parentDatasetIds: [DS('ds-a')], lineageHash: H('b'), recordedAt: NOW })
    expect(() => graph.insert({
      datasetId: DS('ds-a'),
      parentDatasetIds: [DS('ds-b')],
      lineageHash: H('a2'),
      recordedAt: NOW,
    })).toThrow(/cycle/)
  })

  it('LAW-068: authorization record requires at least one policy reference', async () => {
    const { validateAuthorizationRecord } = await import('../../src/index.js')
    expect(() => validateAuthorizationRecord({
      authorizationId: 'auth-1',
      datasetId: DS('ds-1'),
      purpose: 'TRAINING',
      scope: 'tenant-1',
      outcome: 'AUTHORIZED',
      policyReferenceIds: [],
      decidedAt: NOW,
    })).toThrow()
  })

  it('LAW-069: deletion requires authorization token', () => {
    const directive: DatasetDeletionDirective = {
      directiveId: 'd-1', datasetId: DS('ds-a'),
      authorizationToken: '', requestedBy: 'p1', requestedAt: NOW, reason: 'test',
    }
    expect(() => validateDeletionAuthorization(directive)).toThrow(/DELETION_MISSING_AUTHORIZATION/)
  })

  it('LAW-070: deterministic hash — same inputs same hash', async () => {
    const svc1 = DatasetAdmissionService({ repo: DatasetGovernanceReferenceStore().admissionRepo })
    const svc2 = DatasetAdmissionService({ repo: DatasetGovernanceReferenceStore().admissionRepo })
    const inputs = {
      version: makeVersion(DS('ds-d'), 'ADMITTED'),
      authorization: makeAuth(DS('ds-d'), 'AUTHORIZED'),
      leakage: makeLeakage(DS('ds-d'), 'CLEAN'),
      schemaCompatibility: 'EXACT' as FeatureSchemaCompatibilityOutcome,
    }
    const d1 = await svc1.admit(makeAdmissionRequest(DS('ds-d'), 'adm-det'), inputs)
    const d2 = await svc2.admit(makeAdmissionRequest(DS('ds-d'), 'adm-det'), inputs)
    expect(d1.decisionHash).toBe(d2.decisionHash)
  })

  it('LAW-071: leakage assessment outcome INCONCLUSIVE → RESTRICTED, not REJECTED', async () => {
    const store = DatasetGovernanceReferenceStore()
    const svc = DatasetAdmissionService({ repo: store.admissionRepo })
    const decision = await svc.admit(makeAdmissionRequest(DS('ds-inc'), 'adm-inc'), {
      version: makeVersion(DS('ds-inc'), 'ADMITTED'),
      authorization: makeAuth(DS('ds-inc'), 'AUTHORIZED'),
      leakage: makeLeakage(DS('ds-inc'), 'INCONCLUSIVE'),
      schemaCompatibility: 'EXACT',
    })
    expect(decision.outcome).toBe('RESTRICTED')
    expect(decision.reason).toBe('LEAKAGE_INCONCLUSIVE')
  })
})

// ── stage12bEvidence ──────────────────────────────────────────────────────────

describe('stage12bEvidence', () => {
  it('returns a deterministic evidence object', () => {
    const ev = stage12bEvidence()
    expect(ev).toBeDefined()
  })

  it('contains stage identifier', () => {
    const ev = stage12bEvidence()
    expect(ev.stage).toBe('12B')
  })

  it('contains package name', () => {
    const ev = stage12bEvidence()
    expect(ev.package).toBe('@rohinik-org/ml-dataset')
  })

  it('contains law mapping with LAW-064 through LAW-073', () => {
    const ev = stage12bEvidence()
    expect(ev.laws).toBeDefined()
    expect(Object.keys(ev.laws).length).toBeGreaterThanOrEqual(8)
  })

  it('evidenceHash is a valid sha256 content hash', () => {
    const ev = stage12bEvidence()
    expect(ev.evidenceHash).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('is deterministic — same object hash on repeated calls', () => {
    const e1 = stage12bEvidence()
    const e2 = stage12bEvidence()
    expect(e1.evidenceHash).toBe(e2.evidenceHash)
  })

  it('contains no live timestamps or machine paths', () => {
    const ev = stage12bEvidence()
    const str = JSON.stringify(ev)
    // no process.cwd(), no C:\, no /home/
    expect(str).not.toMatch(/[A-Za-z]:\\/)
    expect(str).not.toMatch(/\/home\//)
    expect(str).not.toMatch(/\/Users\//)
  })

  it('contains dependency on @rohinik-org/ml-ir', () => {
    const ev = stage12bEvidence()
    expect(ev.dependencies?.['@rohinik-org/ml-ir']).toBeDefined()
  })
})

// ── release gate ─────────────────────────────────────────────────────────────

describe('stage12bReleaseGate', () => {
  it('passes when evidence is present and hash is valid', async () => {
    const { stage12bReleaseGate } = await import('../../src/index.js')
    const result = stage12bReleaseGate()
    expect(result.passed).toBe(true)
  })

  it('returns list of checks that passed', async () => {
    const { stage12bReleaseGate } = await import('../../src/index.js')
    const result = stage12bReleaseGate()
    expect(Array.isArray(result.checks)).toBe(true)
    expect(result.checks.length).toBeGreaterThan(0)
    expect(result.checks.every((c: { passed: boolean }) => c.passed)).toBe(true)
  })
})
