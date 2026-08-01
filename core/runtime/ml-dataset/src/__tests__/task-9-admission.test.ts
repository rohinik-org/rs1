import { describe, it, expect } from 'vitest'
import {
  type DatasetId, type ContentHash, type DatasetIsoTimestamp,
  type GovernedDatasetVersion, type DatasetVersionLifecycleState,
  type DatasetAuthorizationRecord, type DatasetAuthorizationOutcome,
  type LeakageAssessmentResult, type LeakageAssessmentOutcome,
  type FeatureSchemaCompatibilityOutcome,
  type DatasetAdmissionRequest, type DatasetAdmissionDecision,
  type DatasetAdmissionReason, type DatasetAdmissionEvent,
  type DatasetAdmissionRepository,
  DatasetAdmissionService,
  makeDatasetGovernanceError,
} from '../../src/index.js'

// ── helpers ───────────────────────────────────────────────────────────────────

const DS = 'ds-001' as DatasetId
const TS = '2024-01-01T00:00:00.000Z' as DatasetIsoTimestamp
const HASH = ('sha256:' + 'a'.repeat(64)) as ContentHash

function makeVersion(state: DatasetVersionLifecycleState): GovernedDatasetVersion {
  return { datasetId: DS, version: 'v1', contentHash: HASH, createdAt: TS, state }
}

function makeAuth(outcome: DatasetAuthorizationOutcome): DatasetAuthorizationRecord {
  return {
    authorizationId: 'auth-1', datasetId: DS,
    purpose: 'TRAINING', scope: 'tenant-1',
    outcome, policyReferenceIds: ['pol-1'], decidedAt: TS,
  }
}

function makeLeakage(outcome: LeakageAssessmentOutcome): LeakageAssessmentResult {
  return {
    datasetId: DS, outcome,
    findings: outcome === 'CLEAN' ? [] : [{ kind: 'LABEL', severity: 'HIGH', evidenceRef: 'ref-1' }],
    unavailableDetectorIds: outcome === 'INCONCLUSIVE' ? ['det-1'] : [],
    assessedAt: TS,
    reportHash: HASH,
  }
}

function makeAdmissionRepo(): DatasetAdmissionRepository & { _store: Map<string, DatasetAdmissionDecision> } {
  const store = new Map<string, DatasetAdmissionDecision>()
  return {
    _store: store,
    async save(d) { store.set(d.admissionId, d); return { stored: true, conflict: false } },
    async findById(id) { return store.get(id) },
  }
}

function baseRequest(): DatasetAdmissionRequest {
  return {
    admissionId: 'adm-1',
    datasetId: DS,
    version: 'v1',
    contentHash: HASH,
    purpose: 'TRAINING',
    scope: 'tenant-1',
    requestedAt: TS,
    requestingPrincipalId: 'principal-1',
    tenantId: 'tenant-1',
    environmentId: 'env-prod',
  }
}

// ── decision order: step 1 — invalid identity ─────────────────────────────────

describe('DatasetAdmissionService: step 1 — invalid identity/hash', () => {
  it('mismatched contentHash produces REJECTED with INVALID_IDENTITY reason', async () => {
    const repo = makeAdmissionRepo()
    const svc = DatasetAdmissionService({ repo })
    const req = { ...baseRequest(), contentHash: ('sha256:' + 'b'.repeat(64)) as ContentHash }
    const version = makeVersion('ADMITTED')
    const decision = await svc.admit(req, { version, authorization: makeAuth('AUTHORIZED'), leakage: makeLeakage('CLEAN'), schemaCompatibility: 'EXACT' })
    expect(decision.outcome).toBe('REJECTED')
    expect(decision.reason).toBe('INVALID_IDENTITY')
  })
})

// ── decision order: step 2 — deleted/deletion-pending ────────────────────────

describe('DatasetAdmissionService: step 2 — deleted version', () => {
  it('DELETED version produces REJECTED with VERSION_DELETED reason', async () => {
    const repo = makeAdmissionRepo()
    const svc = DatasetAdmissionService({ repo })
    const decision = await svc.admit(baseRequest(), {
      version: makeVersion('DELETED'),
      authorization: makeAuth('AUTHORIZED'),
      leakage: makeLeakage('CLEAN'),
      schemaCompatibility: 'EXACT',
    })
    expect(decision.outcome).toBe('REJECTED')
    expect(decision.reason).toBe('VERSION_DELETED')
  })

  it('DELETION_PENDING version produces REJECTED', async () => {
    const repo = makeAdmissionRepo()
    const svc = DatasetAdmissionService({ repo })
    const decision = await svc.admit(baseRequest(), {
      version: makeVersion('DELETION_PENDING'),
      authorization: makeAuth('AUTHORIZED'),
      leakage: makeLeakage('CLEAN'),
      schemaCompatibility: 'EXACT',
    })
    expect(decision.outcome).toBe('REJECTED')
    expect(decision.reason).toBe('VERSION_DELETED')
  })
})

// ── decision order: step 4 — authorization ────────────────────────────────────

describe('DatasetAdmissionService: step 4 — authorization', () => {
  it('DENIED authorization produces REJECTED with AUTHORIZATION_DENIED reason', async () => {
    const repo = makeAdmissionRepo()
    const svc = DatasetAdmissionService({ repo })
    const decision = await svc.admit(baseRequest(), {
      version: makeVersion('ADMITTED'),
      authorization: makeAuth('DENIED'),
      leakage: makeLeakage('CLEAN'),
      schemaCompatibility: 'EXACT',
    })
    expect(decision.outcome).toBe('REJECTED')
    expect(decision.reason).toBe('AUTHORIZATION_DENIED')
  })

  it('EXPIRED authorization produces REJECTED', async () => {
    const repo = makeAdmissionRepo()
    const svc = DatasetAdmissionService({ repo })
    const decision = await svc.admit(baseRequest(), {
      version: makeVersion('ADMITTED'),
      authorization: makeAuth('EXPIRED'),
      leakage: makeLeakage('CLEAN'),
      schemaCompatibility: 'EXACT',
    })
    expect(decision.outcome).toBe('REJECTED')
    expect(decision.reason).toBe('AUTHORIZATION_DENIED')
  })
})

// ── decision order: step 5 — schema compatibility ────────────────────────────

describe('DatasetAdmissionService: step 5 — schema compatibility', () => {
  it('INCOMPATIBLE schema produces REJECTED with SCHEMA_INCOMPATIBLE reason', async () => {
    const repo = makeAdmissionRepo()
    const svc = DatasetAdmissionService({ repo })
    const decision = await svc.admit(baseRequest(), {
      version: makeVersion('ADMITTED'),
      authorization: makeAuth('AUTHORIZED'),
      leakage: makeLeakage('CLEAN'),
      schemaCompatibility: 'INCOMPATIBLE',
    })
    expect(decision.outcome).toBe('REJECTED')
    expect(decision.reason).toBe('SCHEMA_INCOMPATIBLE')
  })
})

// ── decision order: step 6 — leakage ─────────────────────────────────────────

describe('DatasetAdmissionService: step 6 — leakage', () => {
  it('BLOCKS_ADMISSION leakage produces REJECTED with LEAKAGE_BLOCKS reason', async () => {
    const repo = makeAdmissionRepo()
    const svc = DatasetAdmissionService({ repo })
    const decision = await svc.admit(baseRequest(), {
      version: makeVersion('ADMITTED'),
      authorization: makeAuth('AUTHORIZED'),
      leakage: makeLeakage('BLOCKS_ADMISSION'),
      schemaCompatibility: 'EXACT',
    })
    expect(decision.outcome).toBe('REJECTED')
    expect(decision.reason).toBe('LEAKAGE_BLOCKS')
  })
})

// ── decision order: step 7 — manual review ───────────────────────────────────

describe('DatasetAdmissionService: step 7 — manual review / conditions', () => {
  it('CONDITIONALLY_AUTHORIZED → RESTRICTED outcome with CONDITIONAL_AUTHORIZATION reason', async () => {
    const repo = makeAdmissionRepo()
    const svc = DatasetAdmissionService({ repo })
    const decision = await svc.admit(baseRequest(), {
      version: makeVersion('ADMITTED'),
      authorization: makeAuth('CONDITIONALLY_AUTHORIZED'),
      leakage: makeLeakage('CLEAN'),
      schemaCompatibility: 'EXACT',
    })
    expect(decision.outcome).toBe('RESTRICTED')
    expect(decision.reason).toBe('CONDITIONAL_AUTHORIZATION')
  })

  it('MANUAL_REVIEW_REQUIRED authorization → RESTRICTED', async () => {
    const repo = makeAdmissionRepo()
    const svc = DatasetAdmissionService({ repo })
    const decision = await svc.admit(baseRequest(), {
      version: makeVersion('ADMITTED'),
      authorization: makeAuth('MANUAL_REVIEW_REQUIRED'),
      leakage: makeLeakage('CLEAN'),
      schemaCompatibility: 'EXACT',
    })
    expect(decision.outcome).toBe('RESTRICTED')
  })

  it('INCONCLUSIVE leakage → RESTRICTED with LEAKAGE_INCONCLUSIVE reason', async () => {
    const repo = makeAdmissionRepo()
    const svc = DatasetAdmissionService({ repo })
    const decision = await svc.admit(baseRequest(), {
      version: makeVersion('ADMITTED'),
      authorization: makeAuth('AUTHORIZED'),
      leakage: makeLeakage('INCONCLUSIVE'),
      schemaCompatibility: 'EXACT',
    })
    expect(decision.outcome).toBe('RESTRICTED')
    expect(decision.reason).toBe('LEAKAGE_INCONCLUSIVE')
  })
})

// ── decision order: step 8 — admitted ────────────────────────────────────────

describe('DatasetAdmissionService: step 8 — admitted', () => {
  it('all checks pass → ADMITTED', async () => {
    const repo = makeAdmissionRepo()
    const svc = DatasetAdmissionService({ repo })
    const decision = await svc.admit(baseRequest(), {
      version: makeVersion('ADMITTED'),
      authorization: makeAuth('AUTHORIZED'),
      leakage: makeLeakage('CLEAN'),
      schemaCompatibility: 'EXACT',
    })
    expect(decision.outcome).toBe('ADMITTED')
    expect(decision.reason).toBe('ALL_CHECKS_PASSED')
  })
})

// ── precedence: earlier checks win ───────────────────────────────────────────

describe('DatasetAdmissionService: precedence', () => {
  it('DELETED version wins over DENIED auth (step 2 beats step 4)', async () => {
    const repo = makeAdmissionRepo()
    const svc = DatasetAdmissionService({ repo })
    const decision = await svc.admit(baseRequest(), {
      version: makeVersion('DELETED'),
      authorization: makeAuth('DENIED'),
      leakage: makeLeakage('BLOCKS_ADMISSION'),
      schemaCompatibility: 'INCOMPATIBLE',
    })
    expect(decision.reason).toBe('VERSION_DELETED')
  })

  it('DENIED auth wins over INCOMPATIBLE schema (step 4 beats step 5)', async () => {
    const repo = makeAdmissionRepo()
    const svc = DatasetAdmissionService({ repo })
    const decision = await svc.admit(baseRequest(), {
      version: makeVersion('ADMITTED'),
      authorization: makeAuth('DENIED'),
      leakage: makeLeakage('BLOCKS_ADMISSION'),
      schemaCompatibility: 'INCOMPATIBLE',
    })
    expect(decision.reason).toBe('AUTHORIZATION_DENIED')
  })
})

// ── persistence ───────────────────────────────────────────────────────────────

describe('DatasetAdmissionService: persistence', () => {
  it('decision is persisted to repository', async () => {
    const repo = makeAdmissionRepo()
    const svc = DatasetAdmissionService({ repo })
    const decision = await svc.admit(baseRequest(), {
      version: makeVersion('ADMITTED'),
      authorization: makeAuth('AUTHORIZED'),
      leakage: makeLeakage('CLEAN'),
      schemaCompatibility: 'EXACT',
    })
    const stored = await repo.findById(decision.admissionId)
    expect(stored).toBeDefined()
    expect(stored?.outcome).toBe('ADMITTED')
  })

  it('reevaluation creates new decision with new admissionId', async () => {
    const repo = makeAdmissionRepo()
    const svc = DatasetAdmissionService({ repo })
    const d1 = await svc.admit(baseRequest(), {
      version: makeVersion('ADMITTED'),
      authorization: makeAuth('AUTHORIZED'),
      leakage: makeLeakage('CLEAN'),
      schemaCompatibility: 'EXACT',
    })
    const d2 = await svc.admit({ ...baseRequest(), admissionId: 'adm-2' }, {
      version: makeVersion('ADMITTED'),
      authorization: makeAuth('AUTHORIZED'),
      leakage: makeLeakage('CLEAN'),
      schemaCompatibility: 'EXACT',
    })
    expect(d1.admissionId).not.toBe(d2.admissionId)
  })
})

// ── deterministic replay ──────────────────────────────────────────────────────

describe('DatasetAdmissionService: deterministic replay', () => {
  it('same inputs produce same decisionHash', async () => {
    const svc1 = DatasetAdmissionService({ repo: makeAdmissionRepo() })
    const svc2 = DatasetAdmissionService({ repo: makeAdmissionRepo() })
    const inputs = {
      version: makeVersion('ADMITTED'),
      authorization: makeAuth('AUTHORIZED'),
      leakage: makeLeakage('CLEAN'),
      schemaCompatibility: 'EXACT' as FeatureSchemaCompatibilityOutcome,
    }
    const d1 = await svc1.admit(baseRequest(), inputs)
    const d2 = await svc2.admit(baseRequest(), inputs)
    expect(d1.decisionHash).toBe(d2.decisionHash)
  })
})

// ── event: no raw data ────────────────────────────────────────────────────────

describe('DatasetAdmissionEvent', () => {
  it('event contains no raw partition or dataset content', () => {
    const ev: DatasetAdmissionEvent = {
      eventId: 'evt-1',
      occurredAt: TS,
      kind: 'dataset.admitted',
      admissionId: 'adm-1',
      datasetId: DS,
      outcome: 'ADMITTED',
      decisionHash: HASH,
    }
    expect(Object.keys(ev)).not.toContain('rawContent')
    expect(Object.keys(ev)).not.toContain('partitions')
    expect(ev.decisionHash).toBeDefined()
  })
})
