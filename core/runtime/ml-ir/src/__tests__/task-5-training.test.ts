import { describe, it, expect } from 'vitest'
import {
  experimentId, trainingRunId, checkpointId, modelId,
  datasetId, partitionId, featureSchemaId,
  contentHash, isoTimestamp,
  canonicalMlHash,
  type ExperimentRecord, type ExperimentObjective,
  type TrainingRun, type TrainingRunState,
  type TrainingEnvironment, type PartitionBinding,
  type HyperparameterSet, type SeedPolicy,
  type ReproducibilityRecord, type ReproducibilityLevel,
  type CheckpointManifest,
  type SubmitTrainingRunRequest, type CancelTrainingRunRequest, type ResumeTrainingRunRequest,
  isValidTrainingRunTransition, TRAINING_RUN_TERMINAL_STATES,
} from '../../src/index.js'

// ── ExperimentRecord ──────────────────────────────────────────────────────────

describe('ExperimentRecord', () => {
  it('constructs valid experiment', () => {
    const obj: ExperimentObjective = { metric: 'f1', direction: 'maximize' }
    const e: ExperimentRecord = {
      experimentId: experimentId('exp-001'),
      name: 'fraud-v1',
      objectives: [obj],
      createdAt: isoTimestamp('2024-01-15T10:00:00.000Z'),
    }
    expect(e.experimentId).toBe('exp-001')
    expect(e.objectives[0]?.metric).toBe('f1')
  })

  it('canonical hash changes when objective direction changes', () => {
    const base: ExperimentRecord = {
      experimentId: experimentId('exp-001'),
      name: 'test',
      objectives: [{ metric: 'loss', direction: 'minimize' }],
      createdAt: isoTimestamp('2024-01-15T10:00:00.000Z'),
    }
    const changed = { ...base, objectives: [{ metric: 'loss', direction: 'maximize' as const }] }
    expect(canonicalMlHash(base)).not.toBe(canonicalMlHash(changed))
  })
})

// ── TrainingRunState lifecycle ────────────────────────────────────────────────

describe('isValidTrainingRunTransition', () => {
  it('DRAFT → ADMISSION_PENDING is valid', () => {
    expect(isValidTrainingRunTransition('DRAFT', 'ADMISSION_PENDING')).toBe(true)
  })
  it('ADMISSION_PENDING → ADMITTED is valid', () => {
    expect(isValidTrainingRunTransition('ADMISSION_PENDING', 'ADMITTED')).toBe(true)
  })
  it('ADMITTED → QUEUED is valid', () => {
    expect(isValidTrainingRunTransition('ADMITTED', 'QUEUED')).toBe(true)
  })
  it('QUEUED → RUNNING is valid', () => {
    expect(isValidTrainingRunTransition('QUEUED', 'RUNNING')).toBe(true)
  })
  it('RUNNING → CHECKPOINTING is valid', () => {
    expect(isValidTrainingRunTransition('RUNNING', 'CHECKPOINTING')).toBe(true)
  })
  it('CHECKPOINTING → RUNNING is valid (resume from checkpoint)', () => {
    expect(isValidTrainingRunTransition('CHECKPOINTING', 'RUNNING')).toBe(true)
  })
  it('RUNNING → SUCCEEDED is valid', () => {
    expect(isValidTrainingRunTransition('RUNNING', 'SUCCEEDED')).toBe(true)
  })
  it('RUNNING → FAILED is valid', () => {
    expect(isValidTrainingRunTransition('RUNNING', 'FAILED')).toBe(true)
  })
  it('RUNNING → CANCELLED is valid', () => {
    expect(isValidTrainingRunTransition('RUNNING', 'CANCELLED')).toBe(true)
  })
  it('ADMISSION_PENDING → FAILED is valid (admission rejection)', () => {
    expect(isValidTrainingRunTransition('ADMISSION_PENDING', 'FAILED')).toBe(true)
  })
  it('QUEUED → CANCELLED is valid', () => {
    expect(isValidTrainingRunTransition('QUEUED', 'CANCELLED')).toBe(true)
  })

  it('DRAFT → RUNNING is invalid (must go through admission)', () => {
    expect(isValidTrainingRunTransition('DRAFT', 'RUNNING')).toBe(false)
  })
  it('SUCCEEDED → RUNNING is invalid (terminal restart rejected)', () => {
    expect(isValidTrainingRunTransition('SUCCEEDED', 'RUNNING')).toBe(false)
  })
  it('FAILED → ADMITTED is invalid (terminal restart rejected)', () => {
    expect(isValidTrainingRunTransition('FAILED', 'ADMITTED')).toBe(false)
  })
  it('CANCELLED → QUEUED is invalid (terminal restart rejected)', () => {
    expect(isValidTrainingRunTransition('CANCELLED', 'QUEUED')).toBe(false)
  })
  it('RUNNING → DRAFT is invalid (backwards)', () => {
    expect(isValidTrainingRunTransition('RUNNING', 'DRAFT')).toBe(false)
  })
})

describe('TRAINING_RUN_TERMINAL_STATES', () => {
  it('SUCCEEDED is terminal', () => {
    expect(TRAINING_RUN_TERMINAL_STATES.has('SUCCEEDED')).toBe(true)
  })
  it('FAILED is terminal', () => {
    expect(TRAINING_RUN_TERMINAL_STATES.has('FAILED')).toBe(true)
  })
  it('CANCELLED is terminal', () => {
    expect(TRAINING_RUN_TERMINAL_STATES.has('CANCELLED')).toBe(true)
  })
  it('RUNNING is not terminal', () => {
    expect(TRAINING_RUN_TERMINAL_STATES.has('RUNNING')).toBe(false)
  })
})

// ── TrainingRun ───────────────────────────────────────────────────────────────

describe('TrainingRun', () => {
  const env: TrainingEnvironment = {
    runtimeId: 'pytorch-2.0',
    frameworkVersion: '2.0.1',
    hardwareClass: 'gpu-a100',
  }

  const hyperparams: HyperparameterSet = {
    values: { lr: 0.001, epochs: 10 },
    parameterHash: contentHash('sha256:' + 'a'.repeat(64)),
  }

  it('constructs valid training run', () => {
    const run: TrainingRun = {
      trainingRunId: trainingRunId('tr-001'),
      experimentId: experimentId('exp-001'),
      state: 'DRAFT',
      modelId: modelId('m-001'),
      trainingDatasetId: datasetId('ds-001'),
      partitionBindings: [{ partitionId: partitionId('p-train'), role: 'train' }],
      featureSchemaId: featureSchemaId('fs-001'),
      environment: env,
      hyperparameters: hyperparams,
      createdAt: isoTimestamp('2024-01-15T10:00:00.000Z'),
    }
    expect(run.state).toBe('DRAFT')
    expect(run.partitionBindings).toHaveLength(1)
  })

  it('training success produces candidate artifact only (no direct model activation)', () => {
    const run: TrainingRun = {
      trainingRunId: trainingRunId('tr-002'),
      experimentId: experimentId('exp-001'),
      state: 'SUCCEEDED',
      modelId: modelId('m-002'),
      trainingDatasetId: datasetId('ds-001'),
      partitionBindings: [],
      featureSchemaId: featureSchemaId('fs-001'),
      environment: env,
      hyperparameters: hyperparams,
      createdAt: isoTimestamp('2024-01-15T10:00:00.000Z'),
      candidateArtifactHash: contentHash('sha256:' + 'b'.repeat(64)),
    }
    // candidateArtifactHash present — not a promoted model, just a candidate
    expect(run.candidateArtifactHash).toBeDefined()
    expect(run.state).toBe('SUCCEEDED')
  })
})

// ── SeedPolicy ────────────────────────────────────────────────────────────────

describe('SeedPolicy', () => {
  it('fixed seed does not imply exact reproducibility', () => {
    const policy: SeedPolicy = {
      kind: 'fixed',
      seed: 42,
    }
    // Fixed seed is necessary but not sufficient for reproducibility.
    // ReproducibilityRecord captures the actual level separately.
    expect(policy.kind).toBe('fixed')
    expect(policy.seed).toBe(42)
  })

  it('nondeterministic seed has justification field', () => {
    const policy: SeedPolicy = {
      kind: 'nondeterministic',
      justification: 'Ensemble diversity required; exact reproduction not needed',
    }
    expect(policy.justification).toBeTruthy()
  })
})

// ── ReproducibilityRecord ─────────────────────────────────────────────────────

describe('ReproducibilityRecord', () => {
  it('exact level captures all required fields', () => {
    const r: ReproducibilityRecord = {
      trainingRunId: trainingRunId('tr-001'),
      level: 'exact',
      sourceHash: contentHash('sha256:' + 'a'.repeat(64)),
      environmentHash: contentHash('sha256:' + 'b'.repeat(64)),
      dataHash: contentHash('sha256:' + 'c'.repeat(64)),
      parameterHash: contentHash('sha256:' + 'd'.repeat(64)),
      seedPolicy: { kind: 'fixed', seed: 42 },
    }
    expect(r.level).toBe('exact')
  })

  it('non-reproducible level requires justification', () => {
    const r: ReproducibilityRecord = {
      trainingRunId: trainingRunId('tr-002'),
      level: 'non-reproducible',
      sourceHash: contentHash('sha256:' + 'a'.repeat(64)),
      environmentHash: contentHash('sha256:' + 'b'.repeat(64)),
      dataHash: contentHash('sha256:' + 'c'.repeat(64)),
      parameterHash: contentHash('sha256:' + 'd'.repeat(64)),
      seedPolicy: { kind: 'nondeterministic', justification: 'streaming data' },
      nonReproducibleJustification: 'Training on live stream, snapshot unavailable',
    }
    expect(r.level).toBe('non-reproducible')
    expect(r.nonReproducibleJustification).toBeTruthy()
  })

  it('canonical hash changes when level changes', () => {
    const base: ReproducibilityRecord = {
      trainingRunId: trainingRunId('tr-001'),
      level: 'exact',
      sourceHash: contentHash('sha256:' + 'a'.repeat(64)),
      environmentHash: contentHash('sha256:' + 'b'.repeat(64)),
      dataHash: contentHash('sha256:' + 'c'.repeat(64)),
      parameterHash: contentHash('sha256:' + 'd'.repeat(64)),
      seedPolicy: { kind: 'fixed', seed: 42 },
    }
    const changed: ReproducibilityRecord = { ...base, level: 'best-effort' }
    expect(canonicalMlHash(base)).not.toBe(canonicalMlHash(changed))
  })
})

// ── CheckpointManifest ────────────────────────────────────────────────────────

describe('CheckpointManifest', () => {
  it('checkpoint has monotonic sequence number', () => {
    const ck1: CheckpointManifest = {
      checkpointId: checkpointId('ck-001'),
      trainingRunId: trainingRunId('tr-001'),
      sequenceNumber: 1,
      contentHash: contentHash('sha256:' + 'a'.repeat(64)),
      savedAt: isoTimestamp('2024-01-15T11:00:00.000Z'),
      epoch: 5,
    }
    const ck2: CheckpointManifest = {
      ...ck1,
      checkpointId: checkpointId('ck-002'),
      sequenceNumber: 2,
      epoch: 10,
    }
    expect(ck2.sequenceNumber).toBeGreaterThan(ck1.sequenceNumber)
  })

  it('checkpoint lineage: resumed run references prior checkpoint', () => {
    const ck: CheckpointManifest = {
      checkpointId: checkpointId('ck-001'),
      trainingRunId: trainingRunId('tr-001'),
      sequenceNumber: 1,
      contentHash: contentHash('sha256:' + 'a'.repeat(64)),
      savedAt: isoTimestamp('2024-01-15T11:00:00.000Z'),
      epoch: 5,
    }
    // ResumeTrainingRunRequest references this checkpoint
    const req: ResumeTrainingRunRequest = {
      originalTrainingRunId: trainingRunId('tr-001'),
      fromCheckpointId: ck.checkpointId,
      newTrainingRunId: trainingRunId('tr-002'),
      requestedAt: isoTimestamp('2024-01-16T00:00:00.000Z'),
    }
    expect(req.fromCheckpointId).toBe(ck.checkpointId)
    expect(req.newTrainingRunId).not.toBe(req.originalTrainingRunId)
  })
})

// ── Request contracts ─────────────────────────────────────────────────────────

describe('SubmitTrainingRunRequest', () => {
  it('constructs valid submit request', () => {
    const req: SubmitTrainingRunRequest = {
      trainingRunId: trainingRunId('tr-submit-001'),
      experimentId: experimentId('exp-001'),
      modelId: modelId('m-001'),
      trainingDatasetId: datasetId('ds-001'),
      partitionBindings: [{ partitionId: partitionId('p-1'), role: 'train' }],
      featureSchemaId: featureSchemaId('fs-001'),
      environment: { runtimeId: 'pytorch-2.0', frameworkVersion: '2.0.1', hardwareClass: 'gpu-v100' },
      hyperparameters: { values: { lr: 0.01 }, parameterHash: contentHash('sha256:' + 'e'.repeat(64)) },
      requestedAt: isoTimestamp('2024-01-15T09:00:00.000Z'),
    }
    expect(req.trainingRunId).toBe('tr-submit-001')
  })
})

describe('CancelTrainingRunRequest', () => {
  it('constructs valid cancel request', () => {
    const req: CancelTrainingRunRequest = {
      trainingRunId: trainingRunId('tr-001'),
      reason: 'Hyperparameter sweep obsoleted this run',
      requestedAt: isoTimestamp('2024-01-15T12:00:00.000Z'),
    }
    expect(req.reason).toBeTruthy()
  })
})

describe('ResumeTrainingRunRequest', () => {
  it('resume creates new run linked to checkpoint (resume identity)', () => {
    const req: ResumeTrainingRunRequest = {
      originalTrainingRunId: trainingRunId('tr-001'),
      fromCheckpointId: checkpointId('ck-003'),
      newTrainingRunId: trainingRunId('tr-002'),
      requestedAt: isoTimestamp('2024-01-16T00:00:00.000Z'),
    }
    // new run ID differs from original — resume is a new run
    expect(req.newTrainingRunId).not.toBe(req.originalTrainingRunId)
  })
})

// ── Round-trip ────────────────────────────────────────────────────────────────

describe('round-trip JSON serialization', () => {
  it('CheckpointManifest round-trips without loss', () => {
    const ck: CheckpointManifest = {
      checkpointId: checkpointId('ck-rt-001'),
      trainingRunId: trainingRunId('tr-rt-001'),
      sequenceNumber: 3,
      contentHash: contentHash('sha256:' + 'f'.repeat(64)),
      savedAt: isoTimestamp('2024-02-01T00:00:00.000Z'),
      epoch: 15,
    }
    const parsed = JSON.parse(JSON.stringify(ck)) as CheckpointManifest
    expect(parsed.checkpointId).toBe(ck.checkpointId)
    expect(parsed.sequenceNumber).toBe(3)
  })

  it('TrainingRun round-trips without loss', () => {
    const run: TrainingRun = {
      trainingRunId: trainingRunId('tr-rt-001'),
      experimentId: experimentId('exp-rt-001'),
      state: 'QUEUED',
      modelId: modelId('m-rt-001'),
      trainingDatasetId: datasetId('ds-rt-001'),
      partitionBindings: [],
      featureSchemaId: featureSchemaId('fs-rt-001'),
      environment: { runtimeId: 'sklearn-1.3', frameworkVersion: '1.3.0', hardwareClass: 'cpu' },
      hyperparameters: { values: { C: 1.0 }, parameterHash: contentHash('sha256:' + 'a'.repeat(64)) },
      createdAt: isoTimestamp('2024-02-01T00:00:00.000Z'),
    }
    const parsed = JSON.parse(JSON.stringify(run)) as TrainingRun
    expect(parsed.trainingRunId).toBe(run.trainingRunId)
    expect(parsed.state).toBe('QUEUED')
  })
})
