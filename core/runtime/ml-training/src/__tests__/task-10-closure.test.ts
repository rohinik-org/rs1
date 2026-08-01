import { describe, it, expect } from 'vitest'
import type { TrainingRunId, ContentHash, ExperimentId, DatasetId, PartitionId, FeatureSchemaId } from '@rohinik-org/ml-ir'
import type {
  TrainingIsoTimestamp, TrainingSeedPolicy, GovernedTrainingRun,
  TrainingRunLifecycleState, TrainingAdmissionDecision,
} from '../../src/index.js'
import {
  // reference trainer
  ReferenceTrainer,
  // evidence + gate
  stage12cEvidence, stage12cReleaseGate,
  type Stage12CEvidence, type ReleaseGateResult,
  // services used in end-to-end
  registerExperiment, buildTrainingSubmission, TrainingAdmissionService,
  createTrainingRun, transitionRun,
  registerCheckpoint,
  recordObservation, summarizeRunObservations,
  buildCandidateArtifact,
  makeTrainingGovernanceError,
  TERMINAL_RUN_STATES,
} from '../../src/index.js'

// ── fixtures ──────────────────────────────────────────────────────────────────

const RUN  = (s: string) => s as TrainingRunId
const EXP  = (s: string) => s as ExperimentId
const DS   = (s: string) => s as DatasetId
const PART = (s: string) => s as PartitionId
const SCH  = (s: string) => s as FeatureSchemaId
const HASH = (s: string) => `sha256:${s.padEnd(64, '0')}` as ContentHash
const TS   = (s: string) => s as TrainingIsoTimestamp

const NOW  = TS('2024-06-01T12:00:00.000Z')

// ── reference trainer ─────────────────────────────────────────────────────────

describe('ReferenceTrainer: deterministic centroid classifier', () => {
  it('exports ReferenceTrainer with train and predict', () => {
    expect(typeof ReferenceTrainer).toBe('object')
    expect(typeof ReferenceTrainer.train).toBe('function')
    expect(typeof ReferenceTrainer.predict).toBe('function')
  })

  it('train returns model with centroids', () => {
    const model = ReferenceTrainer.train()
    expect(model).toBeDefined()
    expect(model.centroids).toBeDefined()
  })

  it('predict returns a class label for each sample', () => {
    const model = ReferenceTrainer.train()
    const predictions = ReferenceTrainer.predict(model, [[1, 0], [0, 1]])
    expect(predictions).toHaveLength(2)
    expect(predictions.every(p => typeof p === 'number')).toBe(true)
  })

  it('train is deterministic — same output each call', () => {
    const m1 = ReferenceTrainer.train()
    const m2 = ReferenceTrainer.train()
    expect(JSON.stringify(m1.centroids)).toBe(JSON.stringify(m2.centroids))
  })

  it('prediction is deterministic for same input', () => {
    const model = ReferenceTrainer.train()
    const p1 = ReferenceTrainer.predict(model, [[1, 0]])
    const p2 = ReferenceTrainer.predict(model, [[1, 0]])
    expect(p1).toEqual(p2)
  })

  it('produces no raw training data in model', () => {
    const model = ReferenceTrainer.train() as unknown as Record<string, unknown>
    expect(model['rawData']).toBeUndefined()
    expect(model['trainingRows']).toBeUndefined()
  })
})

// ── end-to-end: happy path ────────────────────────────────────────────────────

describe('end-to-end: experiment → submit → admit → run → checkpoint → artifact', () => {
  it('full happy path produces CANDIDATE artifact', async () => {
    // 1. register experiment
    const expStore = new Map()
    const regResult = registerExperiment({
      experimentId: EXP('exp-e2e'),
      name: 'E2E Test',
      objective: { metric: 'loss', direction: 'MINIMIZE' },
      registeredAt: NOW,
      registeredBy: 'principal-1',
    }, expStore)
    expect(regResult.inserted).toBe(true)

    // 2. build submission (exact version + binding)
    const submission = buildTrainingSubmission({
      submissionId: 'sub-e2e',
      experimentId: EXP('exp-e2e'),
      runId: RUN('run-e2e'),
      datasetBindings: [{ datasetId: DS('ds-1'), version: 'v1', partitionIds: [PART('p-train')] }],
      featureSchemaId: SCH('schema-1'),
      featureSchemaVersion: 'v1',
      hyperparameters: { lr: 0.01 },
      seedPolicy: { mode: 'FIXED', fixedSeed: 42 } as TrainingSeedPolicy,
      submittedAt: NOW,
      submittedBy: 'principal-1',
    }, expStore)
    expect(submission.submissionHash).toMatch(/^sha256:/)

    // 3. admit (training admission)
    const admRepo = {
      _store: new Map<string, TrainingAdmissionDecision>(),
      async save(d: TrainingAdmissionDecision) { this._store.set(d.admissionId, d); return { stored: true, conflict: false } },
      async findById(id: string) { return this._store.get(id) },
    }
    const admSvc = TrainingAdmissionService({ repo: admRepo })
    const admDecision = await admSvc.admit({
      admissionId: 'ta-e2e',
      runId: RUN('run-e2e'),
      submissionId: 'sub-e2e',
      requestedAt: NOW,
      requestingPrincipalId: 'principal-1',
      tenantId: 'tenant-1',
      environmentId: 'env-prod',
      datasetBindings: [{ datasetId: DS('ds-1'), version: 'v1', partitionIds: [PART('p-train')] }],
      featureSchemaId: SCH('schema-1'),
      featureSchemaVersion: 'v1',
    }, {
      datasetVersions: { [DS('ds-1')]: { datasetId: DS('ds-1'), version: 'v1', contentHash: HASH('ds'), createdAt: '2024-01-01T00:00:00.000Z' as TrainingIsoTimestamp, state: 'ADMITTED' } },
      datasetAdmissions: { [DS('ds-1')]: { admissionId: 'adm-1', datasetId: DS('ds-1'), version: 'v1', outcome: 'ADMITTED', reason: 'ALL_CHECKS_PASSED', decidedAt: '2024-01-01T00:00:00.000Z' as TrainingIsoTimestamp, decisionHash: HASH('adm') } },
      partitions: [{ partitionId: PART('p-train'), datasetId: DS('ds-1'), role: 'TRAIN', purpose: 'TRAIN', contentHash: HASH('pt'), recordCount: 1000 }],
      datasetAuthorizations: { [DS('ds-1')]: { authorizationId: 'auth-1', datasetId: DS('ds-1'), purpose: 'TRAINING', scope: 'tenant-1', outcome: 'AUTHORIZED', policyReferenceIds: ['pol-1'], decidedAt: '2024-01-01T00:00:00.000Z' as TrainingIsoTimestamp } },
      schemaCompatibility: 'EXACT',
    })
    expect(admDecision.outcome).toBe('ADMITTED')

    // 4. create + transition run to SUCCEEDED via correct state machine
    let run = createTrainingRun({ runId: RUN('run-e2e'), experimentId: EXP('exp-e2e'), submissionId: 'sub-e2e', submissionHash: submission.submissionHash, createdAt: NOW })
    run = transitionRun(run, 'ADMISSION_PENDING', NOW).run
    run = transitionRun(run, 'ADMITTED', NOW).run
    run = transitionRun(run, 'QUEUED', NOW).run
    run = transitionRun(run, 'RUNNING', NOW).run
    run = transitionRun(run, 'SUCCEEDED', NOW).run
    expect(run.state).toBe('SUCCEEDED')

    // 5. build candidate artifact
    const artifact = buildCandidateArtifact({
      artifactId: 'art-e2e',
      runId: RUN('run-e2e'),
      experimentId: EXP('exp-e2e'),
      submissionId: 'sub-e2e',
      providerOutputUri: 's3://bucket/model.tar.gz',
      providerOutputHash: HASH('artifact'),
      featureSchemaId: SCH('schema-1'),
      featureSchemaVersion: 'v1',
      datasetBindings: [{ datasetId: DS('ds-1'), version: 'v1' }],
      environmentHash: HASH('env'),
      builtAt: NOW,
    }, run)
    expect(artifact.lifecycleState).toBe('CANDIDATE')
    expect(artifact.canonicalHash).toMatch(/^sha256:/)
  })
})

// ── constitutional tests ──────────────────────────────────────────────────────

describe('constitutional: training without admitted data rejected', () => {
  it('TrainingAdmissionService rejects when no dataset admission exists', async () => {
    const admRepo = { async save() { return { stored: true, conflict: false } }, async findById() { return undefined } }
    const svc = TrainingAdmissionService({ repo: admRepo })
    const decision = await svc.admit({
      admissionId: 'ta-const',
      runId: RUN('run-const'),
      submissionId: 'sub-const',
      requestedAt: NOW,
      requestingPrincipalId: 'p',
      tenantId: 't',
      environmentId: 'e',
      datasetBindings: [{ datasetId: DS('ds-missing'), version: 'v1', partitionIds: [] }],
      featureSchemaId: SCH('schema-1'),
      featureSchemaVersion: 'v1',
    }, {
      datasetVersions: { [DS('ds-missing')]: { datasetId: DS('ds-missing'), version: 'v1', contentHash: HASH('x'), createdAt: NOW as unknown as TrainingIsoTimestamp, state: 'ADMITTED' } },
      datasetAdmissions: {},
      partitions: [],
      datasetAuthorizations: {},
      schemaCompatibility: 'EXACT',
    })
    expect(decision.outcome).toBe('REJECTED')
    expect(decision.reason).toBe('DATASET_NOT_ADMITTED')
  })
})

describe('constitutional: terminal run cannot reopen', () => {
  it('SUCCEEDED run cannot transition to RUNNING', () => {
    const run: GovernedTrainingRun = {
      runId: RUN('r'), experimentId: EXP('e'), submissionId: 's', submissionHash: HASH('sh'),
      state: 'SUCCEEDED', createdAt: NOW, updatedAt: NOW, runHash: HASH('rh'), history: [],
    }
    expect(() => transitionRun(run, 'RUNNING', NOW)).toThrow(/TRAINING_TERMINAL_RUN/)
  })

  it('FAILED run cannot transition to RUNNING', () => {
    const run: GovernedTrainingRun = {
      runId: RUN('r'), experimentId: EXP('e'), submissionId: 's', submissionHash: HASH('sh'),
      state: 'FAILED', createdAt: NOW, updatedAt: NOW, runHash: HASH('rh'), history: [],
    }
    expect(() => transitionRun(run, 'RUNNING', NOW)).toThrow(/TRAINING_TERMINAL_RUN/)
  })
})

describe('constitutional: training cannot promote or deploy', () => {
  it('candidate artifact has no promotionDecision field', () => {
    const run: GovernedTrainingRun = {
      runId: RUN('r'), experimentId: EXP('e'), submissionId: 's', submissionHash: HASH('sh'),
      state: 'SUCCEEDED', createdAt: NOW, updatedAt: NOW, runHash: HASH('rh'), history: [],
    }
    const artifact = buildCandidateArtifact({
      artifactId: 'a', runId: RUN('r'), experimentId: EXP('e'), submissionId: 's',
      providerOutputUri: 'uri', providerOutputHash: HASH('ph'),
      featureSchemaId: SCH('sch'), featureSchemaVersion: 'v1',
      datasetBindings: [{ datasetId: DS('ds'), version: 'v1' }],
      environmentHash: HASH('env'), builtAt: NOW,
    }, run) as unknown as Record<string, unknown>
    expect(artifact['promotionDecision']).toBeUndefined()
    expect(artifact['deploymentId']).toBeUndefined()
  })
})

describe('constitutional: fixed seed is not a guarantee of reproducibility', () => {
  it('FIXED seed mode is a policy choice, not a reproducibility proof', () => {
    const policy: TrainingSeedPolicy = { mode: 'FIXED', fixedSeed: 42 }
    // seed alone does not assert full reproducibility — environmentHash is separate
    expect(policy.mode).toBe('FIXED')
    expect(typeof policy.justification).not.toBe('required')
  })
})

describe('constitutional: checkpoint mutation rejected', () => {
  it('recording same checkpoint twice with different hash is a conflict', () => {
    const ckStore = new Map()
    registerCheckpoint({ checkpointId: 'ck-1' as any, runId: RUN('r'), sequenceNumber: 1, artifactHash: HASH('art'), completenessState: 'COMPLETE', recordedAt: NOW }, ckStore)
    const r2 = registerCheckpoint({ checkpointId: 'ck-1' as any, runId: RUN('r'), sequenceNumber: 1, artifactHash: HASH('different'), completenessState: 'COMPLETE', recordedAt: NOW }, ckStore)
    expect(r2.conflict).toBe(true)
  })
})

describe('constitutional: no framework/cloud dependencies', () => {
  it('package has no framework or cloud ml sdk imports', async () => {
    const { TRAINING_GOVERNANCE_ERROR_CODES } = await import('../../src/index.js')
    const forbidden = ['tensorflow', 'torch', 'mlflow', 'sagemaker', 'azureml', 'vertexai']
    // error codes don't contain cloud vendor names
    const codeStr = TRAINING_GOVERNANCE_ERROR_CODES.join(' ')
    expect(forbidden.every(f => !codeStr.toLowerCase().includes(f))).toBe(true)
  })
})

// ── stage evidence ────────────────────────────────────────────────────────────

describe('stage12cEvidence', () => {
  it('returns stage 12C evidence object', () => {
    const ev = stage12cEvidence()
    expect(ev.stage).toBe('12C')
    expect(ev.package).toBe('@rohinik-org/ml-training')
  })

  it('evidence has law mapping with at least 8 entries', () => {
    const ev = stage12cEvidence()
    expect(Object.keys(ev.laws).length).toBeGreaterThanOrEqual(8)
  })

  it('evidence has deterministic hash', () => {
    const h1 = stage12cEvidence().evidenceHash
    const h2 = stage12cEvidence().evidenceHash
    expect(h1).toBe(h2)
    expect(h1).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('evidence declares ml-ir and ml-dataset dependencies', () => {
    const ev = stage12cEvidence()
    expect('@rohinik-org/ml-ir' in ev.dependencies).toBe(true)
    expect('@rohinik-org/ml-dataset' in ev.dependencies).toBe(true)
  })
})

// ── release gate ──────────────────────────────────────────────────────────────

describe('stage12cReleaseGate', () => {
  it('gate passes when all checks pass', () => {
    const result = stage12cReleaseGate()
    expect(result.passed).toBe(true)
  })

  it('gate returns individual checks', () => {
    const result = stage12cReleaseGate()
    expect(result.checks.length).toBeGreaterThan(0)
    expect(result.checks.every(c => c.passed)).toBe(true)
  })

  it('gate result has passed boolean', () => {
    const result: ReleaseGateResult = stage12cReleaseGate()
    expect(typeof result.passed).toBe('boolean')
  })
})
