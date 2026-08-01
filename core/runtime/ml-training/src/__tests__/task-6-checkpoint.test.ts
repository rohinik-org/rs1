import { describe, it, expect } from 'vitest'
import type { CheckpointId, TrainingRunId, ContentHash } from '@rohinik-org/ml-ir'
import type { TrainingIsoTimestamp, GovernedTrainingRun } from '../../src/index.js'
import {
  createTrainingRun,
  transitionRun,
  registerCheckpoint,
  validateCheckpointResume,
  type GovernedCheckpoint,
  type CheckpointRegistrationResult,
  type CheckpointCompletenessState,
} from '../../src/index.js'

// ── fixtures ──────────────────────────────────────────────────────────────────

const CK  = (s: string) => s as CheckpointId
const RUN = (s: string) => s as TrainingRunId
const H   = (s: string) => `sha256:${s.padEnd(64, '0')}` as ContentHash
const TS  = (s: string) => s as TrainingIsoTimestamp

const NOW  = TS('2024-06-01T10:00:00.000Z')
const NOW2 = TS('2024-06-01T11:00:00.000Z')

function makeRunningRun(runId = 'run-001'): GovernedTrainingRun {
  let run = createTrainingRun({ runId: RUN(runId), experimentId: 'exp-001' as never, submissionId: 'sub-1', submissionHash: H('s'), createdAt: NOW })
  run = transitionRun(run, 'ADMISSION_PENDING', NOW).run
  run = transitionRun(run, 'ADMITTED', NOW).run
  run = transitionRun(run, 'QUEUED', NOW).run
  run = transitionRun(run, 'RUNNING', NOW).run
  return run
}

function baseCheckpoint(overrides?: Partial<Parameters<typeof registerCheckpoint>[0]>): Parameters<typeof registerCheckpoint>[0] {
  return {
    checkpointId: CK('ckpt-001'),
    runId: RUN('run-001'),
    sequenceNumber: 1,
    artifactHash: H('ckpt-artifact'),
    completenessState: 'COMPLETE' as CheckpointCompletenessState,
    recordedAt: NOW,
    ...overrides,
  }
}

// ── registerCheckpoint ────────────────────────────────────────────────────────

describe('registerCheckpoint', () => {
  it('registers first checkpoint successfully', () => {
    const store = new Map<CheckpointId, GovernedCheckpoint>()
    const result = registerCheckpoint(baseCheckpoint(), store)
    expect(result.inserted).toBe(true)
    expect(result.checkpoint.checkpointId).toBe(CK('ckpt-001'))
  })

  it('checkpoint belongs to its run', () => {
    const store = new Map<CheckpointId, GovernedCheckpoint>()
    const result = registerCheckpoint(baseCheckpoint(), store)
    expect(result.checkpoint.runId).toBe(RUN('run-001'))
  })

  it('checkpoint has a checkpointHash', () => {
    const store = new Map<CheckpointId, GovernedCheckpoint>()
    const result = registerCheckpoint(baseCheckpoint(), store)
    expect(result.checkpoint.checkpointHash).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('idempotent: same checkpoint twice → inserted=false, idempotent=true', () => {
    const store = new Map<CheckpointId, GovernedCheckpoint>()
    registerCheckpoint(baseCheckpoint(), store)
    const r2 = registerCheckpoint(baseCheckpoint(), store)
    expect(r2.inserted).toBe(false)
    expect(r2.idempotent).toBe(true)
    expect(r2.conflict).toBe(false)
  })

  it('conflict: same id, different artifactHash', () => {
    const store = new Map<CheckpointId, GovernedCheckpoint>()
    registerCheckpoint(baseCheckpoint(), store)
    const r2 = registerCheckpoint(baseCheckpoint({ artifactHash: H('different') }), store)
    expect(r2.conflict).toBe(true)
    expect(r2.inserted).toBe(false)
  })

  it('sequence must be monotonically increasing', () => {
    const store = new Map<CheckpointId, GovernedCheckpoint>()
    registerCheckpoint(baseCheckpoint({ checkpointId: CK('ckpt-001'), sequenceNumber: 2 }), store)
    expect(() => registerCheckpoint(baseCheckpoint({ checkpointId: CK('ckpt-002'), sequenceNumber: 1 }), store))
      .toThrow(/TRAINING_CHECKPOINT_SEQUENCE_ERROR/)
  })

  it('sequence can be equal to last if different run', () => {
    const store = new Map<CheckpointId, GovernedCheckpoint>()
    registerCheckpoint(baseCheckpoint({ checkpointId: CK('ckpt-001'), runId: RUN('run-001'), sequenceNumber: 2 }), store)
    // different run — sequence independent
    expect(() => registerCheckpoint(baseCheckpoint({ checkpointId: CK('ckpt-002'), runId: RUN('run-002'), sequenceNumber: 1 }), store)).not.toThrow()
  })

  it('rejects self-referential parent (parentCheckpointId === checkpointId)', () => {
    const store = new Map<CheckpointId, GovernedCheckpoint>()
    expect(() => registerCheckpoint(baseCheckpoint({ parentCheckpointId: CK('ckpt-001') }), store))
      .toThrow()
  })

  it('rejects parent from different run', () => {
    const store = new Map<CheckpointId, GovernedCheckpoint>()
    registerCheckpoint(baseCheckpoint({ checkpointId: CK('ckpt-parent'), runId: RUN('run-other') }), store)
    expect(() => registerCheckpoint(
      baseCheckpoint({ checkpointId: CK('ckpt-001'), sequenceNumber: 2, parentCheckpointId: CK('ckpt-parent') }),
      store,
    )).toThrow()
  })
})

// ── completeness states ───────────────────────────────────────────────────────

describe('CheckpointCompletenessState', () => {
  it('COMPLETE checkpoint registers fine', () => {
    const store = new Map<CheckpointId, GovernedCheckpoint>()
    expect(() => registerCheckpoint(baseCheckpoint({ completenessState: 'COMPLETE' }), store)).not.toThrow()
  })

  it('PARTIAL checkpoint registers fine', () => {
    const store = new Map<CheckpointId, GovernedCheckpoint>()
    expect(() => registerCheckpoint(baseCheckpoint({ completenessState: 'PARTIAL' }), store)).not.toThrow()
  })

  it('CORRUPT checkpoint registers fine (recorded but not resumable)', () => {
    const store = new Map<CheckpointId, GovernedCheckpoint>()
    expect(() => registerCheckpoint(baseCheckpoint({ completenessState: 'CORRUPT' }), store)).not.toThrow()
  })
})

// ── validateCheckpointResume ──────────────────────────────────────────────────

describe('validateCheckpointResume', () => {
  it('COMPLETE checkpoint from SUCCEEDED run can resume', () => {
    const store = new Map<CheckpointId, GovernedCheckpoint>()
    registerCheckpoint(baseCheckpoint(), store)
    // source run is terminal (SUCCEEDED) — resume creates new run
    let sourceRun = makeRunningRun()
    sourceRun = transitionRun(sourceRun, 'SUCCEEDED', NOW).run
    expect(() => validateCheckpointResume(CK('ckpt-001'), store, sourceRun)).not.toThrow()
  })

  it('CORRUPT checkpoint cannot resume', () => {
    const store = new Map<CheckpointId, GovernedCheckpoint>()
    registerCheckpoint(baseCheckpoint({ completenessState: 'CORRUPT' }), store)
    let sourceRun = makeRunningRun()
    sourceRun = transitionRun(sourceRun, 'SUCCEEDED', NOW).run
    expect(() => validateCheckpointResume(CK('ckpt-001'), store, sourceRun)).toThrow(/TRAINING_CHECKPOINT_CORRUPT/)
  })

  it('resuming a checkpoint from a still-RUNNING source run is rejected', () => {
    const store = new Map<CheckpointId, GovernedCheckpoint>()
    registerCheckpoint(baseCheckpoint(), store)
    const sourceRun = makeRunningRun() // still RUNNING
    expect(() => validateCheckpointResume(CK('ckpt-001'), store, sourceRun)).toThrow(/TRAINING_TERMINAL_RUN/)
  })

  it('unknown checkpointId throws', () => {
    const store = new Map<CheckpointId, GovernedCheckpoint>()
    let sourceRun = makeRunningRun()
    sourceRun = transitionRun(sourceRun, 'SUCCEEDED', NOW).run
    expect(() => validateCheckpointResume(CK('no-such'), store, sourceRun)).toThrow()
  })
})

// ── immutability ──────────────────────────────────────────────────────────────

describe('GovernedCheckpoint immutability', () => {
  it('has no mutable methods', () => {
    const store = new Map<CheckpointId, GovernedCheckpoint>()
    const { checkpoint } = registerCheckpoint(baseCheckpoint(), store)
    expect(typeof (checkpoint as unknown as Record<string, unknown>)['update']).not.toBe('function')
    expect(typeof (checkpoint as unknown as Record<string, unknown>)['delete']).not.toBe('function')
  })
})

// ── deterministic hash ────────────────────────────────────────────────────────

describe('checkpoint hash determinism', () => {
  it('same input → same checkpointHash', () => {
    const s1 = new Map<CheckpointId, GovernedCheckpoint>()
    const s2 = new Map<CheckpointId, GovernedCheckpoint>()
    const h1 = registerCheckpoint(baseCheckpoint(), s1).checkpoint.checkpointHash
    const h2 = registerCheckpoint(baseCheckpoint(), s2).checkpoint.checkpointHash
    expect(h1).toBe(h2)
  })

  it('different artifactHash → different checkpointHash', () => {
    const s1 = new Map<CheckpointId, GovernedCheckpoint>()
    const s2 = new Map<CheckpointId, GovernedCheckpoint>()
    const h1 = registerCheckpoint(baseCheckpoint({ artifactHash: H('a') }), s1).checkpoint.checkpointHash
    const h2 = registerCheckpoint(baseCheckpoint({ checkpointId: CK('ckpt-002'), artifactHash: H('b') }), s2).checkpoint.checkpointHash
    expect(h1).not.toBe(h2)
  })
})
