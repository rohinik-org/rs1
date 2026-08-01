import { describe, it, expect } from 'vitest'
import type {
  DatasetId, PartitionId, ContentHash, TrainingRunId, FeatureSchemaId,
} from '@rohinik-org/ml-ir'
import type {
  DatasetAdmissionDecision, DatasetAdmissionOutcome, GovernedDatasetVersion, GovernedPartition,
  FeatureSchemaCompatibilityOutcome, DatasetAuthorizationRecord, DatasetAuthorizationOutcome,
  DatasetIsoTimestamp,
} from '@rohinik-org/ml-dataset'
import type {
  TrainingIsoTimestamp, TrainingSeedPolicy, TrainingAdmissionDecision,
  TrainingAdmissionReason, TrainingAdmissionRequest, TrainingAdmissionRepository,
  TrainingAdmissionInputs,
} from '../../src/index.js'
import { TrainingAdmissionService, makeTrainingGovernanceError } from '../../src/index.js'

// ── helpers ───────────────────────────────────────────────────────────────────

const DS    = (s: string) => s as DatasetId
const PART  = (s: string) => s as PartitionId
const RUN   = (s: string) => s as TrainingRunId
const SCH   = (s: string) => s as FeatureSchemaId
const HASH  = (s: string) => `sha256:${s.padEnd(64, '0')}` as ContentHash
const TS    = (s: string) => s as TrainingIsoTimestamp
const DTS   = (s: string) => s as DatasetIsoTimestamp

const NOW = TS('2024-06-01T10:00:00.000Z')
const CONTENT_HASH = HASH('aaaa')

function makeDatasetVersion(state: GovernedDatasetVersion['state'] = 'ADMITTED'): GovernedDatasetVersion {
  return {
    datasetId: DS('ds-1'),
    version: 'v1',
    contentHash: CONTENT_HASH,
    createdAt: DTS('2024-01-01T00:00:00.000Z'),
    state,
  }
}

function makePartitions(): readonly GovernedPartition[] {
  return [
    {
      partitionId: PART('p-train'),
      datasetId: DS('ds-1'),
      role: 'TRAIN',
      purpose: 'TRAIN',
      contentHash: HASH('bbbb'),
      recordCount: 1000,
    },
    {
      partitionId: PART('p-test'),
      datasetId: DS('ds-1'),
      role: 'TEST',
      purpose: 'TEST',
      contentHash: HASH('cccc'),
      recordCount: 200,
    },
  ]
}

function makeDatasetAuth(outcome: DatasetAuthorizationOutcome): DatasetAuthorizationRecord {
  return {
    authorizationId: 'auth-1',
    datasetId: DS('ds-1'),
    purpose: 'TRAINING',
    scope: 'tenant-1',
    outcome,
    policyReferenceIds: ['pol-1'],
    decidedAt: DTS('2024-01-01T00:00:00.000Z'),
  }
}

function makeDatasetAdmission(outcome: DatasetAdmissionOutcome = 'ADMITTED'): DatasetAdmissionDecision {
  return {
    admissionId: 'adm-1',
    datasetId: DS('ds-1'),
    version: 'v1',
    outcome,
    reason: outcome === 'ADMITTED' ? 'ALL_CHECKS_PASSED' : 'AUTHORIZATION_DENIED',
    decidedAt: DTS('2024-01-01T00:00:00.000Z'),
    decisionHash: HASH('dddd'),
  }
}

function makeAdmissionRepo(): TrainingAdmissionRepository & { _store: Map<string, TrainingAdmissionDecision> } {
  const store = new Map<string, TrainingAdmissionDecision>()
  return {
    _store: store,
    async save(d) { store.set(d.admissionId, d); return { stored: true, conflict: false } },
    async findById(id) { return store.get(id) },
  }
}

function baseRequest(): TrainingAdmissionRequest {
  return {
    admissionId: 'ta-1',
    runId: RUN('run-001'),
    submissionId: 'sub-001',
    requestedAt: NOW,
    requestingPrincipalId: 'principal-1',
    tenantId: 'tenant-1',
    environmentId: 'env-prod',
    datasetBindings: [{ datasetId: DS('ds-1'), version: 'v1', partitionIds: [PART('p-train'), PART('p-test')] }],
    featureSchemaId: SCH('schema-1'),
    featureSchemaVersion: 'v1',
  }
}

function baseInputs(): TrainingAdmissionInputs {
  return {
    datasetVersions: { [DS('ds-1')]: makeDatasetVersion() },
    datasetAdmissions: { [DS('ds-1')]: makeDatasetAdmission() },
    partitions: makePartitions(),
    datasetAuthorizations: { [DS('ds-1')]: makeDatasetAuth('AUTHORIZED') },
    schemaCompatibility: 'EXACT',
  }
}

// ── step 1 — identity/hash ────────────────────────────────────────────────────

describe('TrainingAdmissionService: step 1 — invalid submission identity', () => {
  it('mismatched runId in binding produces REJECTED with INVALID_IDENTITY reason', async () => {
    const repo = makeAdmissionRepo()
    const svc = TrainingAdmissionService({ repo })
    const req = { ...baseRequest(), datasetBindings: [{ datasetId: DS('ds-1'), version: 'v99', partitionIds: [PART('p-train')] }] }
    const decision = await svc.admit(req, baseInputs())
    expect(decision.outcome).toBe('REJECTED')
    expect(decision.reason).toBe('INVALID_IDENTITY')
  })
})

// ── step 2 — missing or non-admitted dataset ──────────────────────────────────

describe('TrainingAdmissionService: step 2 — dataset not admitted', () => {
  it('dataset with no admission decision produces REJECTED with DATASET_NOT_ADMITTED reason', async () => {
    const repo = makeAdmissionRepo()
    const svc = TrainingAdmissionService({ repo })
    const inputs = { ...baseInputs(), datasetAdmissions: {} }
    const decision = await svc.admit(baseRequest(), inputs)
    expect(decision.outcome).toBe('REJECTED')
    expect(decision.reason).toBe('DATASET_NOT_ADMITTED')
  })

  it('dataset admission outcome REJECTED produces REJECTED', async () => {
    const repo = makeAdmissionRepo()
    const svc = TrainingAdmissionService({ repo })
    const inputs = { ...baseInputs(), datasetAdmissions: { [DS('ds-1')]: makeDatasetAdmission('REJECTED') } }
    const decision = await svc.admit(baseRequest(), inputs)
    expect(decision.outcome).toBe('REJECTED')
    expect(decision.reason).toBe('DATASET_NOT_ADMITTED')
  })
})

// ── step 3 — deleted/restricted conflict ─────────────────────────────────────

describe('TrainingAdmissionService: step 3 — deleted/restricted conflict', () => {
  it('DELETED dataset version produces REJECTED with DATASET_DELETED_OR_RESTRICTED reason', async () => {
    const repo = makeAdmissionRepo()
    const svc = TrainingAdmissionService({ repo })
    const inputs = {
      ...baseInputs(),
      datasetVersions: { [DS('ds-1')]: makeDatasetVersion('DELETED') },
    }
    const decision = await svc.admit(baseRequest(), inputs)
    expect(decision.outcome).toBe('REJECTED')
    expect(decision.reason).toBe('DATASET_DELETED_OR_RESTRICTED')
  })

  it('RESTRICTED dataset version produces REJECTED', async () => {
    const repo = makeAdmissionRepo()
    const svc = TrainingAdmissionService({ repo })
    const inputs = {
      ...baseInputs(),
      datasetVersions: { [DS('ds-1')]: makeDatasetVersion('RESTRICTED') },
    }
    const decision = await svc.admit(baseRequest(), inputs)
    expect(decision.outcome).toBe('REJECTED')
    expect(decision.reason).toBe('DATASET_DELETED_OR_RESTRICTED')
  })
})

// ── step 4 — missing partition binding ───────────────────────────────────────

describe('TrainingAdmissionService: step 4 — missing partition binding', () => {
  it('partition ID referenced in binding but not in provided partitions produces REJECTED', async () => {
    const repo = makeAdmissionRepo()
    const svc = TrainingAdmissionService({ repo })
    const req = {
      ...baseRequest(),
      datasetBindings: [{
        datasetId: DS('ds-1'),
        version: 'v1',
        partitionIds: [PART('p-train'), PART('p-missing')],
      }],
    }
    const decision = await svc.admit(req, baseInputs())
    expect(decision.outcome).toBe('REJECTED')
    expect(decision.reason).toBe('PARTITION_MISSING')
  })
})

// ── step 5 — invalid partition purpose ───────────────────────────────────────

describe('TrainingAdmissionService: step 5 — invalid partition purpose', () => {
  it('partition with SHADOW purpose produces REJECTED with PARTITION_INVALID_PURPOSE reason', async () => {
    const repo = makeAdmissionRepo()
    const svc = TrainingAdmissionService({ repo })
    const partitions: readonly GovernedPartition[] = [
      ...makePartitions(),
      {
        partitionId: PART('p-shadow'),
        datasetId: DS('ds-1'),
        role: 'SHADOW',
        purpose: 'SHADOW',
        contentHash: HASH('eeee'),
        recordCount: 50,
      },
    ]
    const req = {
      ...baseRequest(),
      datasetBindings: [{
        datasetId: DS('ds-1'),
        version: 'v1',
        partitionIds: [PART('p-train'), PART('p-shadow')],
      }],
    }
    const inputs = { ...baseInputs(), partitions }
    const decision = await svc.admit(req, inputs)
    expect(decision.outcome).toBe('REJECTED')
    expect(decision.reason).toBe('PARTITION_INVALID_PURPOSE')
  })

  it('TRAIN and TEST partitions are valid purposes', async () => {
    const repo = makeAdmissionRepo()
    const svc = TrainingAdmissionService({ repo })
    const decision = await svc.admit(baseRequest(), baseInputs())
    expect(decision.outcome).toBe('ADMITTED')
  })
})

// ── step 6 — incompatible feature schema ─────────────────────────────────────

describe('TrainingAdmissionService: step 6 — schema incompatible', () => {
  it('INCOMPATIBLE schema produces REJECTED with SCHEMA_INCOMPATIBLE reason', async () => {
    const repo = makeAdmissionRepo()
    const svc = TrainingAdmissionService({ repo })
    const inputs = { ...baseInputs(), schemaCompatibility: 'INCOMPATIBLE' as FeatureSchemaCompatibilityOutcome }
    const decision = await svc.admit(baseRequest(), inputs)
    expect(decision.outcome).toBe('REJECTED')
    expect(decision.reason).toBe('SCHEMA_INCOMPATIBLE')
  })
})

// ── step 7 — authorization mismatch ──────────────────────────────────────────

describe('TrainingAdmissionService: step 7 — authorization denied', () => {
  it('DENIED dataset authorization produces REJECTED with AUTHORIZATION_DENIED reason', async () => {
    const repo = makeAdmissionRepo()
    const svc = TrainingAdmissionService({ repo })
    const inputs = {
      ...baseInputs(),
      datasetAuthorizations: { [DS('ds-1')]: makeDatasetAuth('DENIED') },
    }
    const decision = await svc.admit(baseRequest(), inputs)
    expect(decision.outcome).toBe('REJECTED')
    expect(decision.reason).toBe('AUTHORIZATION_DENIED')
  })

  it('EXPIRED authorization produces REJECTED', async () => {
    const repo = makeAdmissionRepo()
    const svc = TrainingAdmissionService({ repo })
    const inputs = {
      ...baseInputs(),
      datasetAuthorizations: { [DS('ds-1')]: makeDatasetAuth('EXPIRED') },
    }
    const decision = await svc.admit(baseRequest(), inputs)
    expect(decision.outcome).toBe('REJECTED')
    expect(decision.reason).toBe('AUTHORIZATION_DENIED')
  })
})

// ── step 8 — policy/resource denial ──────────────────────────────────────────

describe('TrainingAdmissionService: step 8 — policy denied', () => {
  it('policy DENIED produces REJECTED with POLICY_DENIED reason', async () => {
    const repo = makeAdmissionRepo()
    const svc = TrainingAdmissionService({ repo })
    const inputs = { ...baseInputs(), policyDecision: 'DENIED' as const }
    const decision = await svc.admit(baseRequest(), inputs)
    expect(decision.outcome).toBe('REJECTED')
    expect(decision.reason).toBe('POLICY_DENIED')
  })
})

// ── step 9 — manual review / conditional ─────────────────────────────────────

describe('TrainingAdmissionService: step 9 — manual review', () => {
  it('CONDITIONALLY_AUTHORIZED dataset auth produces RESTRICTED with CONDITIONAL_AUTHORIZATION reason', async () => {
    const repo = makeAdmissionRepo()
    const svc = TrainingAdmissionService({ repo })
    const inputs = {
      ...baseInputs(),
      datasetAuthorizations: { [DS('ds-1')]: makeDatasetAuth('CONDITIONALLY_AUTHORIZED') },
    }
    const decision = await svc.admit(baseRequest(), inputs)
    expect(decision.outcome).toBe('RESTRICTED')
    expect(decision.reason).toBe('CONDITIONAL_AUTHORIZATION')
  })

  it('MANUAL_REVIEW_REQUIRED dataset auth produces RESTRICTED', async () => {
    const repo = makeAdmissionRepo()
    const svc = TrainingAdmissionService({ repo })
    const inputs = {
      ...baseInputs(),
      datasetAuthorizations: { [DS('ds-1')]: makeDatasetAuth('MANUAL_REVIEW_REQUIRED') },
    }
    const decision = await svc.admit(baseRequest(), inputs)
    expect(decision.outcome).toBe('RESTRICTED')
  })

  it('policy MANUAL_REVIEW produces RESTRICTED', async () => {
    const repo = makeAdmissionRepo()
    const svc = TrainingAdmissionService({ repo })
    const inputs = { ...baseInputs(), policyDecision: 'MANUAL_REVIEW' as const }
    const decision = await svc.admit(baseRequest(), inputs)
    expect(decision.outcome).toBe('RESTRICTED')
    expect(decision.reason).toBe('MANUAL_REVIEW')
  })
})

// ── step 10 — admitted ────────────────────────────────────────────────────────

describe('TrainingAdmissionService: step 10 — admitted', () => {
  it('all checks pass → ADMITTED with ALL_CHECKS_PASSED reason', async () => {
    const repo = makeAdmissionRepo()
    const svc = TrainingAdmissionService({ repo })
    const decision = await svc.admit(baseRequest(), baseInputs())
    expect(decision.outcome).toBe('ADMITTED')
    expect(decision.reason).toBe('ALL_CHECKS_PASSED')
  })
})

// ── precedence ────────────────────────────────────────────────────────────────

describe('TrainingAdmissionService: precedence', () => {
  it('step 2 (dataset not admitted) beats step 7 (auth denied)', async () => {
    const repo = makeAdmissionRepo()
    const svc = TrainingAdmissionService({ repo })
    const inputs = {
      ...baseInputs(),
      datasetAdmissions: {},
      datasetAuthorizations: { [DS('ds-1')]: makeDatasetAuth('DENIED') },
    }
    const decision = await svc.admit(baseRequest(), inputs)
    expect(decision.reason).toBe('DATASET_NOT_ADMITTED')
  })

  it('step 3 (version deleted) beats step 6 (schema incompatible)', async () => {
    const repo = makeAdmissionRepo()
    const svc = TrainingAdmissionService({ repo })
    const inputs = {
      ...baseInputs(),
      datasetVersions: { [DS('ds-1')]: makeDatasetVersion('DELETED') },
      schemaCompatibility: 'INCOMPATIBLE' as FeatureSchemaCompatibilityOutcome,
    }
    const decision = await svc.admit(baseRequest(), inputs)
    expect(decision.reason).toBe('DATASET_DELETED_OR_RESTRICTED')
  })
})

// ── persistence ───────────────────────────────────────────────────────────────

describe('TrainingAdmissionService: persistence', () => {
  it('decision is saved to repository', async () => {
    const repo = makeAdmissionRepo()
    const svc = TrainingAdmissionService({ repo })
    const decision = await svc.admit(baseRequest(), baseInputs())
    const stored = await repo.findById(decision.admissionId)
    expect(stored).toBeDefined()
    expect(stored?.outcome).toBe('ADMITTED')
  })

  it('re-evaluation creates new decision with new admissionId', async () => {
    const repo = makeAdmissionRepo()
    const svc = TrainingAdmissionService({ repo })
    const d1 = await svc.admit(baseRequest(), baseInputs())
    const d2 = await svc.admit({ ...baseRequest(), admissionId: 'ta-2' }, baseInputs())
    expect(d1.admissionId).not.toBe(d2.admissionId)
    expect(repo._store.size).toBe(2)
  })
})

// ── deterministic replay ──────────────────────────────────────────────────────

describe('TrainingAdmissionService: deterministic replay', () => {
  it('same inputs produce same admissionHash', async () => {
    const svc1 = TrainingAdmissionService({ repo: makeAdmissionRepo() })
    const svc2 = TrainingAdmissionService({ repo: makeAdmissionRepo() })
    const d1 = await svc1.admit(baseRequest(), baseInputs())
    const d2 = await svc2.admit(baseRequest(), baseInputs())
    expect(d1.admissionHash).toBe(d2.admissionHash)
  })
})

// ── no stale decision bypass ──────────────────────────────────────────────────

describe('TrainingAdmissionService: exact version requirement', () => {
  it('binding version mismatch with provided dataset version produces REJECTED', async () => {
    const repo = makeAdmissionRepo()
    const svc = TrainingAdmissionService({ repo })
    const req = {
      ...baseRequest(),
      datasetBindings: [{ datasetId: DS('ds-1'), version: 'v2', partitionIds: [PART('p-train')] }],
    }
    const decision = await svc.admit(req, baseInputs())
    expect(decision.outcome).toBe('REJECTED')
    expect(decision.reason).toBe('INVALID_IDENTITY')
  })
})
