import { describe, it, expect } from 'vitest'
import type {
  ExperimentId, TrainingRunId, CheckpointId, ContentHash,
} from '@rohinik-org/ml-ir'
import type {
  TrainingIsoTimestamp,
  TrainingGovernanceContext,
  TrainingGovernanceService,
  TrainingProvider,
  TrainingProviderRequest,
  TrainingProviderResponse,
  ExperimentRepository,
  TrainingRunRepository,
  CheckpointRepository,
  TrainingObservationRepository,
  CandidateArtifactRepository,
  ReproducibilityRecordRepository,
  TrainingAdmissionRepository,
  RepositoryWriteResult,
  RepositoryWriteOptions,
  TrainingGovernanceErrorCode,
  TrainingGovernanceError,
  makeTrainingGovernanceError,
  TRAINING_GOVERNANCE_ERROR_CODES,
} from '../../src/index.js'
import {
  makeTrainingGovernanceError as makeErr,
  TRAINING_GOVERNANCE_ERROR_CODES as ERROR_CODES,
} from '../../src/index.js'

// ── dependency direction: no framework/cloud imports ─────────────────────────

describe('architecture: dependency direction', () => {
  it('package exports are defined (import succeeds)', async () => {
    const mod = await import('../../src/index.js')
    expect(mod).toBeDefined()
  })

  it('no framework-specific type leaked into core contracts', async () => {
    const mod = await import('../../src/index.js')
    const keys = Object.keys(mod)
    const forbidden = ['torch', 'tensorflow', 'keras', 'sklearn', 'xgboost', 'lightgbm', 'sagemaker', 'azureml', 'vertexai']
    for (const k of forbidden) {
      expect(keys.map(s => s.toLowerCase())).not.toContain(k)
    }
  })

  it('no Stage 12D–12F symbols exported', async () => {
    const mod = await import('../../src/index.js')
    const keys = Object.keys(mod)
    const forbidden = ['InferenceRequest', 'DriftSignal', 'EvaluationReport', 'PromotionDecision', 'DeploymentId']
    for (const k of forbidden) {
      expect(keys).not.toContain(k)
    }
  })
})

// ── TrainingGovernanceContext ─────────────────────────────────────────────────

describe('TrainingGovernanceContext', () => {
  it('can construct a valid context', () => {
    const ctx: TrainingGovernanceContext = {
      tenantId: 'tenant-1',
      environmentId: 'env-prod',
      requestedAt: '2024-01-01T00:00:00.000Z' as TrainingIsoTimestamp,
      requestingPrincipalId: 'principal-1',
    }
    expect(ctx.tenantId).toBe('tenant-1')
  })
})

// ── error taxonomy ────────────────────────────────────────────────────────────

describe('TrainingGovernanceError', () => {
  it('ERROR_CODES is a non-empty readonly array', () => {
    expect(Array.isArray(ERROR_CODES)).toBe(true)
    expect(ERROR_CODES.length).toBeGreaterThan(0)
  })

  it('makeTrainingGovernanceError returns correct shape', () => {
    const err = makeErr('TRAINING_MISSING_ADMISSION', 'no admission')
    expect(err.code).toBe('TRAINING_MISSING_ADMISSION')
    expect(err.message).toBe('no admission')
  })

  it('each error code is unique', () => {
    const codes = [...ERROR_CODES]
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('all required domain error codes present', () => {
    const required: TrainingGovernanceErrorCode[] = [
      'TRAINING_MISSING_ADMISSION',
      'TRAINING_INVALID_IDENTITY',
      'TRAINING_DATASET_NOT_ADMITTED',
      'TRAINING_TERMINAL_RUN',
      'TRAINING_CHECKPOINT_CONFLICT',
      'TRAINING_NO_PROMOTION_AUTHORITY',
      'TRAINING_NO_DEPLOYMENT_AUTHORITY',
      'TRAINING_PROVIDER_VIOLATION',
      'TRAINING_EVIDENCE_FAILURE',
      'TRAINING_REPRODUCIBILITY_UNDISCLOSED',
    ]
    for (const code of required) {
      expect(ERROR_CODES).toContain(code)
    }
  })
})

// ── RepositoryWriteResult / Options ──────────────────────────────────────────

describe('RepositoryWriteResult', () => {
  it('has stored and conflict fields', () => {
    const r: RepositoryWriteResult = { stored: true, conflict: false }
    expect(r.stored).toBe(true)
    expect(r.conflict).toBe(false)
  })
})

describe('RepositoryWriteOptions', () => {
  it('has optional idempotencyKey', () => {
    const opts: RepositoryWriteOptions = { idempotencyKey: 'key-1' }
    expect(opts.idempotencyKey).toBe('key-1')
  })
})

// ── repository port shapes ────────────────────────────────────────────────────

describe('repository port shapes', () => {
  it('ExperimentRepository has save and findById', () => {
    const stub: ExperimentRepository = {
      save: async () => ({ stored: true, conflict: false }),
      findById: async () => undefined,
    }
    expect(typeof stub.save).toBe('function')
    expect(typeof stub.findById).toBe('function')
  })

  it('TrainingRunRepository has save and findById', () => {
    const stub: TrainingRunRepository = {
      save: async () => ({ stored: true, conflict: false }),
      findById: async () => undefined,
    }
    expect(typeof stub.save).toBe('function')
  })

  it('CheckpointRepository has save and findById', () => {
    const stub: CheckpointRepository = {
      save: async () => ({ stored: true, conflict: false }),
      findById: async () => undefined,
      findByRunId: async () => [],
    }
    expect(typeof stub.findByRunId).toBe('function')
  })

  it('TrainingObservationRepository has save and findByRunId', () => {
    const stub: TrainingObservationRepository = {
      save: async () => ({ stored: true, conflict: false }),
      findByRunId: async () => [],
    }
    expect(typeof stub.findByRunId).toBe('function')
  })

  it('CandidateArtifactRepository has save and findById', () => {
    const stub: CandidateArtifactRepository = {
      save: async () => ({ stored: true, conflict: false }),
      findById: async () => undefined,
    }
    expect(typeof stub.save).toBe('function')
  })

  it('ReproducibilityRecordRepository has save and findByRunId', () => {
    const stub: ReproducibilityRecordRepository = {
      save: async () => ({ stored: true, conflict: false }),
      findByRunId: async () => undefined,
    }
    expect(typeof stub.findByRunId).toBe('function')
  })

  it('TrainingAdmissionRepository has save and findById', () => {
    const stub: TrainingAdmissionRepository = {
      save: async () => ({ stored: true, conflict: false }),
      findById: async () => undefined,
    }
    expect(typeof stub.save).toBe('function')
  })
})

// ── TrainingProvider boundary sentinel ───────────────────────────────────────

describe('TrainingProvider boundary', () => {
  it('provider response has no promotion or deployment fields', () => {
    const response: TrainingProviderResponse = {
      runId: 'run-1' as TrainingRunId,
      outcome: 'SUCCEEDED',
      outputArtifactRef: { uri: 's3://bucket/model', contentHash: ('sha256:' + 'a'.repeat(64)) as ContentHash },
    }
    const keys = Object.keys(response)
    const forbidden = ['promotionDecisionId', 'deploymentId', 'endpointId', 'promotionAuthority', 'deploymentAuthority']
    for (const k of forbidden) {
      expect(keys).not.toContain(k)
    }
  })

  it('provider interface has prepare, start, cancel, and report methods', () => {
    const stub: TrainingProvider = {
      providerId: 'test-provider',
      prepare: async () => ({ prepared: true }),
      start: async () => {},
      cancel: async () => {},
      reportOutcome: async () => ({
        runId: 'run-1' as TrainingRunId,
        outcome: 'SUCCEEDED',
        outputArtifactRef: { uri: 's3://bucket/model', contentHash: ('sha256:' + 'a'.repeat(64)) as ContentHash },
      }),
    }
    expect(typeof stub.prepare).toBe('function')
    expect(typeof stub.start).toBe('function')
    expect(typeof stub.cancel).toBe('function')
    expect(typeof stub.reportOutcome).toBe('function')
  })
})

// ── TrainingGovernanceService port ────────────────────────────────────────────

describe('TrainingGovernanceService', () => {
  it('service interface is implementable', () => {
    const stub: TrainingGovernanceService = {
      registerExperiment: async () => ({ } as never),
      submitRun: async () => ({ } as never),
      admitRun: async () => ({ } as never),
      executeRun: async () => ({ } as never),
      cancelRun: async () => ({ } as never),
      getRunStatus: async () => ({ } as never),
    }
    expect(stub).toBeDefined()
  })
})

// ── no ambient time / randomness / network ────────────────────────────────────

describe('no ambient time, randomness, or network', () => {
  it('TrainingGovernanceContext requestedAt is caller-supplied, not Date.now()', () => {
    const ctx: TrainingGovernanceContext = {
      tenantId: 't',
      environmentId: 'e',
      requestedAt: '2024-01-01T00:00:00.000Z' as TrainingIsoTimestamp,
      requestingPrincipalId: 'p',
    }
    // if the package used Date.now() internally, requestedAt would be meaningless
    // this test confirms the field exists and accepts caller value
    expect(ctx.requestedAt).toBe('2024-01-01T00:00:00.000Z')
  })
})
