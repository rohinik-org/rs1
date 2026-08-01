import { describe, it, expect } from 'vitest'
import type { ExperimentId, TrainingRunId, ContentHash, DatasetId, PartitionId, FeatureSchemaId } from '@rohinik-org/ml-ir'
import type {
  TrainingIsoTimestamp,
  TrainingSeedPolicy,
  GovernedExperiment,
  ExperimentLifecycleState,
  ExperimentObjective,
  TrainingSubmission,
  ExperimentRegistrationResult,
} from '../../src/index.js'
import {
  registerExperiment,
  buildTrainingSubmission,
  validateExperimentRegistration,
  computeSubmissionHash,
} from '../../src/index.js'

// ── fixtures ──────────────────────────────────────────────────────────────────

const EXP   = (s: string) => s as ExperimentId
const RUN   = (s: string) => s as TrainingRunId
const DS    = (s: string) => s as DatasetId
const PART  = (s: string) => s as PartitionId
const SCH   = (s: string) => s as FeatureSchemaId
const H     = (s: string) => `sha256:${s.padEnd(64, '0')}` as ContentHash
const TS    = (s: string) => s as TrainingIsoTimestamp

const NOW  = TS('2024-06-01T10:00:00.000Z')

const BASE_OBJECTIVE: ExperimentObjective = {
  metric: 'accuracy',
  direction: 'MAXIMIZE',
}

function baseExperiment(): Parameters<typeof registerExperiment>[0] {
  return {
    experimentId: EXP('exp-001'),
    name: 'Test Experiment',
    objective: BASE_OBJECTIVE,
    registeredAt: NOW,
    registeredBy: 'principal-1',
  }
}

function baseSubmission() {
  return {
    submissionId: 'sub-001',
    experimentId: EXP('exp-001'),
    runId: RUN('run-001'),
    datasetBindings: [{ datasetId: DS('ds-1'), version: 'v1', partitionIds: [PART('p-1')] }],
    featureSchemaId: SCH('schema-1'),
    featureSchemaVersion: 'v1',
    hyperparameters: { lr: 0.01, epochs: 10 },
    seedPolicy: { mode: 'FIXED', fixedSeed: 42 } as TrainingSeedPolicy,
    submittedAt: NOW,
    submittedBy: 'principal-1',
  }
}

// ── validateExperimentRegistration ───────────────────────────────────────────

describe('validateExperimentRegistration', () => {
  it('accepts valid experiment', () => {
    expect(() => validateExperimentRegistration(baseExperiment())).not.toThrow()
  })

  it('rejects empty experimentId', () => {
    const bad = { ...baseExperiment(), experimentId: '' as ExperimentId }
    expect(() => validateExperimentRegistration(bad)).toThrow()
  })

  it('rejects empty name', () => {
    const bad = { ...baseExperiment(), name: '' }
    expect(() => validateExperimentRegistration(bad)).toThrow()
  })

  it('rejects objective with empty metric', () => {
    const bad = { ...baseExperiment(), objective: { metric: '', direction: 'MAXIMIZE' as const } }
    expect(() => validateExperimentRegistration(bad)).toThrow()
  })
})

// ── registerExperiment ────────────────────────────────────────────────────────

describe('registerExperiment', () => {
  it('returns inserted=true for new experiment', () => {
    const store = new Map<string, GovernedExperiment>()
    const result = registerExperiment(baseExperiment(), store)
    expect(result.inserted).toBe(true)
    expect(result.experiment.experimentId).toBe(EXP('exp-001'))
  })

  it('experiment starts in OPEN state', () => {
    const store = new Map<string, GovernedExperiment>()
    const result = registerExperiment(baseExperiment(), store)
    expect(result.experiment.state).toBe('OPEN')
  })

  it('idempotent: same id + same hash returns inserted=false, idempotent=true', () => {
    const store = new Map<string, GovernedExperiment>()
    registerExperiment(baseExperiment(), store)
    const r2 = registerExperiment(baseExperiment(), store)
    expect(r2.inserted).toBe(false)
    expect(r2.idempotent).toBe(true)
    expect(r2.conflict).toBe(false)
  })

  it('conflict: same id, different name → conflict=true', () => {
    const store = new Map<string, GovernedExperiment>()
    registerExperiment(baseExperiment(), store)
    const r2 = registerExperiment({ ...baseExperiment(), name: 'Different Name' }, store)
    expect(r2.inserted).toBe(false)
    expect(r2.conflict).toBe(true)
  })

  it('stores experiment in provided map', () => {
    const store = new Map<string, GovernedExperiment>()
    registerExperiment(baseExperiment(), store)
    expect(store.has(EXP('exp-001'))).toBe(true)
  })
})

// ── experiment lifecycle / closure ────────────────────────────────────────────

describe('experiment lifecycle', () => {
  it('closed experiment rejects new submission', () => {
    const store = new Map<string, GovernedExperiment>()
    registerExperiment(baseExperiment(), store)
    const exp = store.get(EXP('exp-001'))!
    const closed: GovernedExperiment = { ...exp, state: 'CLOSED' }
    store.set(EXP('exp-001'), closed)
    expect(() => buildTrainingSubmission(baseSubmission(), store)).toThrow(/TRAINING_EXPERIMENT_CLOSED/)
  })

  it('OPEN experiment accepts submission', () => {
    const store = new Map<string, GovernedExperiment>()
    registerExperiment(baseExperiment(), store)
    expect(() => buildTrainingSubmission(baseSubmission(), store)).not.toThrow()
  })
})

// ── buildTrainingSubmission ───────────────────────────────────────────────────

describe('buildTrainingSubmission', () => {
  it('returns a submission with correct experimentId', () => {
    const store = new Map<string, GovernedExperiment>()
    registerExperiment(baseExperiment(), store)
    const sub = buildTrainingSubmission(baseSubmission(), store)
    expect(sub.experimentId).toBe(EXP('exp-001'))
  })

  it('submission has a non-empty submissionHash', () => {
    const store = new Map<string, GovernedExperiment>()
    registerExperiment(baseExperiment(), store)
    const sub = buildTrainingSubmission(baseSubmission(), store)
    expect(sub.submissionHash).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('rejects unknown experimentId', () => {
    const store = new Map<string, GovernedExperiment>()
    // don't register
    expect(() => buildTrainingSubmission(baseSubmission(), store)).toThrow()
  })

  it('rejects empty datasetBindings', () => {
    const store = new Map<string, GovernedExperiment>()
    registerExperiment(baseExperiment(), store)
    const bad = { ...baseSubmission(), datasetBindings: [] }
    expect(() => buildTrainingSubmission(bad, store)).toThrow()
  })

  it('rejects empty hyperparameters (must have at least one key)', () => {
    const store = new Map<string, GovernedExperiment>()
    registerExperiment(baseExperiment(), store)
    const bad = { ...baseSubmission(), hyperparameters: {} }
    expect(() => buildTrainingSubmission(bad, store)).toThrow()
  })
})

// ── computeSubmissionHash ─────────────────────────────────────────────────────

describe('computeSubmissionHash', () => {
  it('is deterministic', () => {
    const store = new Map<string, GovernedExperiment>()
    registerExperiment(baseExperiment(), store)
    const s1 = buildTrainingSubmission(baseSubmission(), store)
    const s2 = buildTrainingSubmission(baseSubmission(), store)
    expect(s1.submissionHash).toBe(s2.submissionHash)
  })

  it('changes when hyperparameters change', () => {
    const store = new Map<string, GovernedExperiment>()
    registerExperiment(baseExperiment(), store)
    const s1 = buildTrainingSubmission(baseSubmission(), store)
    const s2 = buildTrainingSubmission({ ...baseSubmission(), hyperparameters: { lr: 0.001, epochs: 10 } }, store)
    expect(s1.submissionHash).not.toBe(s2.submissionHash)
  })

  it('changes when dataset version changes', () => {
    const store = new Map<string, GovernedExperiment>()
    registerExperiment(baseExperiment(), store)
    const s1 = buildTrainingSubmission(baseSubmission(), store)
    const s2 = buildTrainingSubmission({
      ...baseSubmission(),
      datasetBindings: [{ datasetId: DS('ds-1'), version: 'v2', partitionIds: [PART('p-1')] }],
    }, store)
    expect(s1.submissionHash).not.toBe(s2.submissionHash)
  })

  it('standalone computeSubmissionHash matches submission hash', () => {
    const store = new Map<string, GovernedExperiment>()
    registerExperiment(baseExperiment(), store)
    const sub = buildTrainingSubmission(baseSubmission(), store)
    const hash = computeSubmissionHash(sub)
    expect(hash).toBe(sub.submissionHash)
  })
})

// ── immutability ──────────────────────────────────────────────────────────────

describe('immutability sentinels', () => {
  it('GovernedExperiment has no mutable methods', () => {
    const store = new Map<string, GovernedExperiment>()
    const result = registerExperiment(baseExperiment(), store)
    const exp = result.experiment
    expect(typeof (exp as unknown as Record<string, unknown>)['update']).not.toBe('function')
    expect(typeof (exp as unknown as Record<string, unknown>)['close']).not.toBe('function')
  })

  it('TrainingSubmission has no mutable methods', () => {
    const store = new Map<string, GovernedExperiment>()
    registerExperiment(baseExperiment(), store)
    const sub = buildTrainingSubmission(baseSubmission(), store)
    expect(typeof (sub as unknown as Record<string, unknown>)['update']).not.toBe('function')
  })
})

// ── objective directions ──────────────────────────────────────────────────────

describe('ExperimentObjective', () => {
  it('accepts MAXIMIZE direction', () => {
    const obj: ExperimentObjective = { metric: 'f1', direction: 'MAXIMIZE' }
    expect(obj.direction).toBe('MAXIMIZE')
  })

  it('accepts MINIMIZE direction', () => {
    const obj: ExperimentObjective = { metric: 'loss', direction: 'MINIMIZE' }
    expect(obj.direction).toBe('MINIMIZE')
  })
})

// ── baseline reference ────────────────────────────────────────────────────────

describe('baseline reference', () => {
  it('submission can reference a baseline run', () => {
    const store = new Map<string, GovernedExperiment>()
    registerExperiment(baseExperiment(), store)
    const sub = buildTrainingSubmission({ ...baseSubmission(), baselineRunId: RUN('run-baseline') }, store)
    expect(sub.baselineRunId).toBe(RUN('run-baseline'))
  })

  it('submission without baseline is valid', () => {
    const store = new Map<string, GovernedExperiment>()
    registerExperiment(baseExperiment(), store)
    const sub = buildTrainingSubmission(baseSubmission(), store)
    expect(sub.baselineRunId).toBeUndefined()
  })
})
