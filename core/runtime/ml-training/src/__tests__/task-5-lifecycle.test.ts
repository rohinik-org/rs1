import { describe, it, expect } from 'vitest'
import type { TrainingRunId, ExperimentId, ContentHash } from '@rohinik-org/ml-ir'
import type {
  TrainingIsoTimestamp,
  TrainingRunLifecycleState,
  GovernedTrainingRun,
  TrainingRunTransitionResult,
} from '../../src/index.js'
import {
  createTrainingRun,
  transitionRun,
  isTerminalRunState,
  VALID_RUN_TRANSITIONS,
} from '../../src/index.js'

// ── fixtures ──────────────────────────────────────────────────────────────────

const RUN  = (s: string) => s as TrainingRunId
const EXP  = (s: string) => s as ExperimentId
const H    = (s: string) => `sha256:${s.padEnd(64, '0')}` as ContentHash
const TS   = (s: string) => s as TrainingIsoTimestamp

const NOW  = TS('2024-06-01T10:00:00.000Z')
const RUN_ID = RUN('run-001')
const EXP_ID = EXP('exp-001')

function makeRun(state?: TrainingRunLifecycleState): GovernedTrainingRun {
  const base = createTrainingRun({
    runId: RUN_ID, experimentId: EXP_ID,
    submissionId: 'sub-001', submissionHash: H('sub'), createdAt: NOW,
  })
  if (!state || state === 'DRAFT') return base
  // each state needs explicit path to reach it
  const paths: Partial<Record<TrainingRunLifecycleState, TrainingRunLifecycleState[]>> = {
    ADMISSION_PENDING: ['ADMISSION_PENDING'],
    ADMITTED:          ['ADMISSION_PENDING', 'ADMITTED'],
    QUEUED:            ['ADMISSION_PENDING', 'ADMITTED', 'QUEUED'],
    RUNNING:           ['ADMISSION_PENDING', 'ADMITTED', 'QUEUED', 'RUNNING'],
    CHECKPOINTING:     ['ADMISSION_PENDING', 'ADMITTED', 'QUEUED', 'RUNNING', 'CHECKPOINTING'],
    SUCCEEDED:         ['ADMISSION_PENDING', 'ADMITTED', 'QUEUED', 'RUNNING', 'SUCCEEDED'],
    FAILED:            ['ADMISSION_PENDING', 'FAILED'],
    CANCELLED:         ['ADMISSION_PENDING', 'ADMITTED', 'QUEUED', 'CANCELLED'],
  }
  const path = paths[state] ?? []
  let run = base
  for (const s of path) {
    run = transitionRun(run, s, NOW).run
  }
  return run
}

// ── createTrainingRun ─────────────────────────────────────────────────────────

describe('createTrainingRun', () => {
  it('starts in DRAFT state', () => {
    const run = createTrainingRun({ runId: RUN_ID, experimentId: EXP_ID, submissionId: 'sub-1', submissionHash: H('s'), createdAt: NOW })
    expect(run.state).toBe('DRAFT')
  })

  it('has correct runId and experimentId', () => {
    const run = createTrainingRun({ runId: RUN_ID, experimentId: EXP_ID, submissionId: 'sub-1', submissionHash: H('s'), createdAt: NOW })
    expect(run.runId).toBe(RUN_ID)
    expect(run.experimentId).toBe(EXP_ID)
  })

  it('has a non-empty runHash', () => {
    const run = createTrainingRun({ runId: RUN_ID, experimentId: EXP_ID, submissionId: 'sub-1', submissionHash: H('s'), createdAt: NOW })
    expect(run.runHash).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('rejects empty runId', () => {
    expect(() => createTrainingRun({ runId: '' as TrainingRunId, experimentId: EXP_ID, submissionId: 'sub-1', submissionHash: H('s'), createdAt: NOW })).toThrow()
  })
})

// ── valid transitions ─────────────────────────────────────────────────────────

describe('transitionRun: valid transitions', () => {
  it('DRAFT → ADMISSION_PENDING', () => {
    const run = createTrainingRun({ runId: RUN_ID, experimentId: EXP_ID, submissionId: 'sub-1', submissionHash: H('s'), createdAt: NOW })
    const result = transitionRun(run, 'ADMISSION_PENDING', NOW)
    expect(result.transitioned).toBe(true)
    expect(result.run.state).toBe('ADMISSION_PENDING')
  })

  it('ADMISSION_PENDING → ADMITTED', () => {
    const run = makeRun('ADMISSION_PENDING')
    expect(transitionRun(run, 'ADMITTED', NOW).run.state).toBe('ADMITTED')
  })

  it('ADMITTED → QUEUED', () => {
    const run = makeRun('ADMITTED')
    expect(transitionRun(run, 'QUEUED', NOW).run.state).toBe('QUEUED')
  })

  it('QUEUED → RUNNING', () => {
    const run = makeRun('QUEUED')
    expect(transitionRun(run, 'RUNNING', NOW).run.state).toBe('RUNNING')
  })

  it('RUNNING → CHECKPOINTING', () => {
    const run = makeRun('RUNNING')
    expect(transitionRun(run, 'CHECKPOINTING', NOW).run.state).toBe('CHECKPOINTING')
  })

  it('CHECKPOINTING → RUNNING', () => {
    const run = makeRun('CHECKPOINTING')
    expect(transitionRun(run, 'RUNNING', NOW).run.state).toBe('RUNNING')
  })

  it('RUNNING → SUCCEEDED', () => {
    const run = makeRun('RUNNING')
    expect(transitionRun(run, 'SUCCEEDED', NOW).run.state).toBe('SUCCEEDED')
  })

  it('RUNNING → FAILED', () => {
    const run = makeRun('RUNNING')
    expect(transitionRun(run, 'FAILED', NOW).run.state).toBe('FAILED')
  })

  it('RUNNING → CANCELLED', () => {
    const run = makeRun('RUNNING')
    expect(transitionRun(run, 'CANCELLED', NOW).run.state).toBe('CANCELLED')
  })

  it('QUEUED → CANCELLED', () => {
    const run = makeRun('QUEUED')
    expect(transitionRun(run, 'CANCELLED', NOW).run.state).toBe('CANCELLED')
  })

  it('ADMISSION_PENDING → FAILED', () => {
    const run = makeRun('ADMISSION_PENDING')
    expect(transitionRun(run, 'FAILED', NOW).run.state).toBe('FAILED')
  })
})

// ── invalid transitions ───────────────────────────────────────────────────────

describe('transitionRun: invalid transitions', () => {
  it('DRAFT → RUNNING rejected', () => {
    const run = createTrainingRun({ runId: RUN_ID, experimentId: EXP_ID, submissionId: 'sub-1', submissionHash: H('s'), createdAt: NOW })
    expect(() => transitionRun(run, 'RUNNING', NOW)).toThrow(/TRAINING_INVALID_TRANSITION/)
  })

  it('ADMITTED → RUNNING rejected (must go through QUEUED)', () => {
    const run = makeRun('ADMITTED')
    expect(() => transitionRun(run, 'RUNNING', NOW)).toThrow(/TRAINING_INVALID_TRANSITION/)
  })

  it('SUCCEEDED → RUNNING rejected (terminal)', () => {
    const run = makeRun('SUCCEEDED')
    expect(() => transitionRun(run, 'RUNNING', NOW)).toThrow(/TRAINING_TERMINAL_RUN/)
  })

  it('FAILED → RUNNING rejected (terminal)', () => {
    const run = makeRun('FAILED')
    expect(() => transitionRun(run, 'RUNNING', NOW)).toThrow(/TRAINING_TERMINAL_RUN/)
  })

  it('CANCELLED → QUEUED rejected (terminal)', () => {
    const run = makeRun('CANCELLED')
    expect(() => transitionRun(run, 'QUEUED', NOW)).toThrow(/TRAINING_TERMINAL_RUN/)
  })
})

// ── terminal state detection ──────────────────────────────────────────────────

describe('isTerminalRunState', () => {
  it('SUCCEEDED is terminal', () => expect(isTerminalRunState('SUCCEEDED')).toBe(true))
  it('FAILED is terminal',    () => expect(isTerminalRunState('FAILED')).toBe(true))
  it('CANCELLED is terminal', () => expect(isTerminalRunState('CANCELLED')).toBe(true))
  it('RUNNING is not terminal', () => expect(isTerminalRunState('RUNNING')).toBe(false))
  it('DRAFT is not terminal',   () => expect(isTerminalRunState('DRAFT')).toBe(false))
})

// ── idempotent transition ─────────────────────────────────────────────────────

describe('transitionRun: idempotent same-state', () => {
  it('transitioning to same non-terminal state returns idempotent=true', () => {
    const run = makeRun('RUNNING')
    const result = transitionRun(run, 'RUNNING', NOW)
    expect(result.idempotent).toBe(true)
    expect(result.transitioned).toBe(false)
  })
})

// ── run history ───────────────────────────────────────────────────────────────

describe('GovernedTrainingRun history', () => {
  it('records state transitions in history', () => {
    const run0 = createTrainingRun({ runId: RUN_ID, experimentId: EXP_ID, submissionId: 'sub-1', submissionHash: H('s'), createdAt: NOW })
    const run1 = transitionRun(run0, 'ADMISSION_PENDING', NOW).run
    const run2 = transitionRun(run1, 'ADMITTED', NOW).run
    expect(run2.history.length).toBeGreaterThanOrEqual(2)
  })

  it('each history entry has fromState and toState', () => {
    const run0 = createTrainingRun({ runId: RUN_ID, experimentId: EXP_ID, submissionId: 'sub-1', submissionHash: H('s'), createdAt: NOW })
    const run1 = transitionRun(run0, 'ADMISSION_PENDING', NOW).run
    const entry = run1.history[run1.history.length - 1]
    expect(entry.fromState).toBe('DRAFT')
    expect(entry.toState).toBe('ADMISSION_PENDING')
  })
})

// ── no promotion/deployment fields ───────────────────────────────────────────

describe('no promotion/deployment fields sentinel', () => {
  it('GovernedTrainingRun has no promotionDecisionId or deploymentId', () => {
    const run = createTrainingRun({ runId: RUN_ID, experimentId: EXP_ID, submissionId: 'sub-1', submissionHash: H('s'), createdAt: NOW })
    const keys = Object.keys(run)
    expect(keys).not.toContain('promotionDecisionId')
    expect(keys).not.toContain('deploymentId')
    expect(keys).not.toContain('endpointId')
  })
})

// ── VALID_RUN_TRANSITIONS export ──────────────────────────────────────────────

describe('VALID_RUN_TRANSITIONS', () => {
  it('is a non-empty map/object', () => {
    expect(Object.keys(VALID_RUN_TRANSITIONS).length).toBeGreaterThan(0)
  })

  it('DRAFT can transition to ADMISSION_PENDING', () => {
    expect(VALID_RUN_TRANSITIONS['DRAFT']).toContain('ADMISSION_PENDING')
  })

  it('SUCCEEDED has no valid transitions', () => {
    expect(VALID_RUN_TRANSITIONS['SUCCEEDED']).toHaveLength(0)
  })
})
